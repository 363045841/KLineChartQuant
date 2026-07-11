/**
 * createChartController — production ChartControllerFactory.
 *
 * Wraps the legacy chart engine (`src/core/chart.ts`) behind the
 * framework-agnostic `ChartController` signal surface. Adapters
 * (React / Vue / Angular) consume this.
 *
 * Boundaries owned here:
 *   - Construct the inner DOM scaffold the legacy `Chart` expects.
 *   - Bridge Chart's facade signals into controller-owned signals.
 *   - Delegate zoom / interaction / indicator / drawing methods to Chart.
 *   - Tear down DOM + listeners on dispose().
 */

import { resolveSettings } from '../foundation/config/chartSettings'
import { Chart, type InteractionSnapshot as LegacyInteractionSnapshot } from '../engine/chart'
import type {
  ChartOptions,
  ViewportState as LegacyViewportState,
  IndicatorInstance as LegacyIndicatorInstance,
  SubPaneInfo as LegacySubPaneInfo,
  DrawingObject as LegacyDrawingObject,
  DrawingToolType as LegacyDrawingToolType,
} from '../engine/chartTypes'
import { loadBuiltinIndicators } from '../engine/indicators/registerBuiltins'
import type { CustomMarkerEntity } from '../engine/marker/registry'
import { zoomLevelToKWidth, kGapFromKWidth } from '../engine/utils/zoom'
import { KLineChartError } from '../errors'
import { ChartBridge } from '../features/mcp/chartBridge'
import { createSignal, computed, type Signal } from '../foundation/reactivity/index'

import type {
  ChartController,
  ChartMountOptions,
  ChartViewport,
  DrawingToolType,
  DrawingObject,
  SubPaneInfo,
  IndicatorInstance,
  InteractionSnapshot,
  DrawingControllerCallbacks,
  IndicatorDefinition,
  KLineData,
  PaneLayoutInfo,
  PaneSpec,
  SymbolSpec,
  SymbolInfo,
  DataFetcher,
  CustomDataSource,
} from './types'

// Plugin-backed drawings expose `kind` instead of legacy `type`.
type PluginBackedDrawingObject = {
  id: string
  kind: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_OPTS = {
  yPaddingPx: 20,
  minKWidth: 1,
  maxKWidth: 50,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  priceLabelWidth: 60,
  zoomLevels: 20,
  initialZoomLevel: 3,
} as const

const INITIAL_INTERACTION: InteractionSnapshot = {
  crosshairPos: null,
  crosshairIndex: null,
  crosshairPrice: null,
  hoveredIndex: null,
  activePaneId: null,
  tooltipPos: { x: 0, y: 0 },
  tooltipAnchorPlacement: 'right-bottom',
  hoveredMarkerData: null,
  hoveredCustomMarker: null,
  isDragging: false,
  isResizingPaneBoundary: false,
  isHoveringPaneBoundary: false,
  hoveredPaneBoundaryId: null,
  isHoveringRightAxis: false,
}

// ---------------------------------------------------------------------------
// Indicator catalog (mirrors renderer ids registered in the engine)
// ---------------------------------------------------------------------------

const DEFAULT_INDICATOR_CATALOG: ReadonlyArray<IndicatorDefinition> = [
  { id: 'MA', label: 'MA', name: '移动平均线', role: 'main', params: [] },
  { id: 'BOLL', label: 'BOLL', name: '布林带', role: 'main', params: [] },
  { id: 'EXPMA', label: 'EXPMA', name: '指数平均线', role: 'main', params: [] },
  { id: 'ENE', label: 'ENE', name: '轨道线', role: 'main', params: [] },
  { id: 'SAR', label: 'SAR', name: '抛物线', role: 'main', params: [] },
  { id: 'SUPERTREND', label: 'SuperTrend', name: '超级趋势', role: 'main', params: [] },
  { id: 'STRUCTURE', label: 'Structure', name: 'SMC 结构', role: 'main', params: [] },
  { id: 'ZONES', label: 'Zones', name: 'SMC 区域', role: 'main', params: [] },
  { id: 'VOLUME', label: 'VOL', name: '成交量', role: 'sub', params: [] },
  { id: 'MACD', label: 'MACD', name: 'MACD', role: 'sub', params: [] },
  { id: 'RSI', label: 'RSI', name: '相对强弱', role: 'sub', params: [] },
  { id: 'CCI', label: 'CCI', name: '顺势指标', role: 'sub', params: [] },
  { id: 'STOCH', label: 'KDJ/STOCH', name: '随机指标', role: 'sub', params: [] },
  { id: 'MOM', label: 'MOM', name: '动量', role: 'sub', params: [] },
  { id: 'WMSR', label: 'WMSR', name: '威廉指标', role: 'sub', params: [] },
  { id: 'KST', label: 'KST', name: 'KST 振荡器', role: 'sub', params: [] },
  { id: 'FASTK', label: 'FASTK', name: '快速 K', role: 'sub', params: [] },
  { id: 'OBV', label: 'OBV', name: '能量潮', role: 'sub', params: [] },
  { id: 'VWAP', label: 'VWAP', name: '成交量加权均价', role: 'sub', params: [] },
  { id: 'VOLUME_PROFILE', label: 'VP', name: '成交量分布', role: 'sub', params: [] },
]

// ---------------------------------------------------------------------------
// DOM scaffolding
// ---------------------------------------------------------------------------

interface MountedDom {
  container: HTMLDivElement
  scrollContent?: HTMLDivElement
  canvasLayer: HTMLDivElement
  rightAxisLayer: HTMLDivElement
  leftAxisLayer?: HTMLDivElement
  xAxisCanvas: HTMLCanvasElement
  cleanup: () => void
}

function mapViewportState(vp: LegacyViewportState): ChartViewport {
  return {
    zoomLevel: vp.zoomLevel,
    plotWidth: vp.plotWidth,
    plotHeight: vp.plotHeight,
    dpr: vp.dpr,
    visibleFrom: vp.visibleFrom,
    visibleTo: vp.visibleTo,
    kWidth: vp.kWidth,
    kGap: vp.kGap,
  }
}

function mapIndicatorInstance(indicator: LegacyIndicatorInstance): IndicatorInstance {
  return {
    id: indicator.id,
    definitionId: indicator.definitionId,
    label: indicator.label,
    name: indicator.name,
    role: indicator.role,
    paneId: indicator.paneId,
    params: { ...indicator.params },
  }
}

function mapSubPaneInfo(subPane: LegacySubPaneInfo): SubPaneInfo {
  return {
    paneId: subPane.paneId,
    indicatorId: subPane.indicatorId,
    params: { ...subPane.params },
    ratio: subPane.ratio,
  }
}

function mapDrawingTool(tool: LegacyDrawingToolType | null): DrawingToolType | null {
  return tool
}

function mapPluginDrawingKind(kind: PluginBackedDrawingObject['kind']): DrawingToolType {
  switch (kind) {
    case 'trend-line':
    case 'ray':
    case 'extended-line':
      return 'trendline'
    case 'horizontal-line':
    case 'horizontal-ray':
    case 'flat-line':
      return 'horizontal'
    default:
      return 'trendline'
  }
}

function mapDrawingObject(drawing: LegacyDrawingObject | PluginBackedDrawingObject): DrawingObject {
  return {
    id: drawing.id,
    type:
      'type' in drawing
        ? (mapDrawingTool(drawing.type) ?? drawing.type)
        : mapPluginDrawingKind(drawing.kind),
  }
}

function mapPaneRatios(ratios: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return { ...ratios }
}

function mapInteractionRecord<T>(value: T | null | undefined): T | null {
  if (!value) {
    return null
  }
  return { ...value } as T
}

function mapInteractionSnapshot(snapshot: LegacyInteractionSnapshot): InteractionSnapshot {
  return {
    crosshairPos: snapshot.crosshairPos ? { ...snapshot.crosshairPos } : null,
    crosshairIndex: snapshot.crosshairIndex,
    crosshairPrice: snapshot.crosshairPrice,
    hoveredIndex: snapshot.hoveredIndex,
    activePaneId: snapshot.activePaneId,
    tooltipPos: { ...snapshot.tooltipPos },
    tooltipAnchorPlacement: snapshot.tooltipAnchorPlacement,
    hoveredMarkerData: mapInteractionRecord(snapshot.hoveredMarkerData),
    hoveredCustomMarker: mapInteractionRecord(snapshot.hoveredCustomMarker),
    isDragging: snapshot.isDragging,
    isResizingPaneBoundary: snapshot.isResizingPaneBoundary,
    isHoveringPaneBoundary: snapshot.isHoveringPaneBoundary,
    hoveredPaneBoundaryId: snapshot.hoveredPaneBoundaryId,
    isHoveringRightAxis: snapshot.isHoveringRightAxis,
  }
}

function buildDom(container: HTMLElement): MountedDom {
  const ownerDoc = container.ownerDocument
  if (!ownerDoc) {
    throw new KLineChartError(
      'CONTROLLER_CONFIG_INVALID',
      '[createChartController] container has no ownerDocument; cannot build DOM scaffold',
    )
  }

  let chartContainer: HTMLDivElement
  let containerCreatedByUs = false
  if (container instanceof HTMLDivElement) {
    chartContainer = container
  } else {
    chartContainer = ownerDoc.createElement('div')
    chartContainer.style.width = '100%'
    chartContainer.style.height = '100%'
    container.appendChild(chartContainer)
    containerCreatedByUs = true
  }
  chartContainer.style.position = 'relative'
  chartContainer.style.overflow = 'auto'

  const scrollContent = ownerDoc.createElement('div')
  scrollContent.className = 'klc-scroll-content'
  scrollContent.style.position = 'relative'

  const canvasLayer = ownerDoc.createElement('div')
  canvasLayer.className = 'klc-canvas-layer'
  canvasLayer.style.position = 'sticky'
  canvasLayer.style.top = '0'
  canvasLayer.style.left = '0'
  canvasLayer.style.zIndex = '1'

  const xAxisCanvas = ownerDoc.createElement('canvas')
  xAxisCanvas.className = 'klc-x-axis-canvas'

  canvasLayer.appendChild(xAxisCanvas)
  scrollContent.appendChild(canvasLayer)
  chartContainer.appendChild(scrollContent)

  const rightAxisLayer = ownerDoc.createElement('div')
  rightAxisLayer.className = 'klc-right-axis-host'
  rightAxisLayer.style.position = 'absolute'
  rightAxisLayer.style.top = '0'
  rightAxisLayer.style.right = '0'
  chartContainer.appendChild(rightAxisLayer)

  const leftAxisLayer = ownerDoc.createElement('div')
  leftAxisLayer.className = 'klc-left-axis-host'
  leftAxisLayer.style.position = 'absolute'
  leftAxisLayer.style.top = '0'
  leftAxisLayer.style.left = '0'
  chartContainer.appendChild(leftAxisLayer)

  const cleanup = (): void => {
    try {
      scrollContent.remove()
      rightAxisLayer.remove()
      leftAxisLayer.remove()
      if (containerCreatedByUs) {
        chartContainer.remove()
      }
    } catch {
      /* DOM may already be gone — best effort */
    }
  }

  return {
    container: chartContainer,
    scrollContent,
    canvasLayer,
    rightAxisLayer,
    leftAxisLayer,
    xAxisCanvas,
    cleanup,
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createChartController(opts: ChartMountOptions): Promise<ChartController> {
  if (!opts) {
    throw new KLineChartError(
      'CONTROLLER_CONFIG_INVALID',
      '[createChartController] opts is required',
    )
  }
  if (!opts.container) {
    throw new KLineChartError(
      'CONTROLLER_CONFIG_INVALID',
      '[createChartController] opts.container must be a non-null HTMLElement',
    )
  }

  await loadBuiltinIndicators()

  const hasExistingDom = !!(opts.canvasLayer && opts.rightAxisLayer && opts.xAxisCanvas)
  const mounted = hasExistingDom
    ? {
        container: opts.container as HTMLDivElement,
        scrollContent:
          (opts.container as HTMLDivElement).querySelector<HTMLDivElement>('.scroll-content') ??
          undefined,
        canvasLayer: opts.canvasLayer as HTMLDivElement,
        rightAxisLayer: opts.rightAxisLayer as HTMLDivElement,
        leftAxisLayer: opts.leftAxisLayer as HTMLDivElement | undefined,
        xAxisCanvas: opts.xAxisCanvas!,
        cleanup: () => {
          /* DOM owned by caller */
        },
      }
    : buildDom(opts.container)

  // ── Fix 0×0 sizing for buildDom()-created right axis host ──
  if (!hasExistingDom && mounted.rightAxisLayer) {
    const hostWidth =
      (opts.rightAxisWidth ?? DEFAULT_OPTS.rightAxisWidth) +
      (opts.priceLabelWidth ?? DEFAULT_OPTS.priceLabelWidth)
    mounted.rightAxisLayer.style.bottom = '0'
    mounted.rightAxisLayer.style.width = hostWidth + 'px'
  }

  const initialZoomLevel = opts.initialZoomLevel ?? DEFAULT_OPTS.initialZoomLevel
  const zoomLevelCount = opts.zoomLevels ?? DEFAULT_OPTS.zoomLevels

  const chartOptions: ChartOptions = {
    yPaddingPx: opts.yPaddingPx ?? DEFAULT_OPTS.yPaddingPx,
    rightAxisWidth: opts.rightAxisWidth ?? DEFAULT_OPTS.rightAxisWidth,
    leftAxisWidth: opts.leftAxisWidth ?? DEFAULT_OPTS.leftAxisWidth,
    bottomAxisHeight: opts.bottomAxisHeight ?? DEFAULT_OPTS.bottomAxisHeight,
    minKWidth: opts.minKWidth ?? DEFAULT_OPTS.minKWidth,
    maxKWidth: opts.maxKWidth ?? DEFAULT_OPTS.maxKWidth,
    priceLabelWidth: opts.priceLabelWidth ?? DEFAULT_OPTS.priceLabelWidth,
    panes: [{ id: 'main', ratio: 1 }],
    paneGap: 0,
    zoomLevels: zoomLevelCount,
    initialZoomLevel,
  }

  const chart = new Chart(
    {
      container: mounted.container,
      scrollContent: mounted.scrollContent,
      canvasLayer: mounted.canvasLayer,
      rightAxisLayer: mounted.rightAxisLayer,
      leftAxisLayer: mounted.leftAxisLayer,
      xAxisCanvas: mounted.xAxisCanvas,
    },
    chartOptions,
  )

  const currentDpr =
    typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  const currentKWidth = zoomLevelToKWidth(initialZoomLevel, {
    minKWidth: DEFAULT_OPTS.minKWidth,
    maxKWidth: DEFAULT_OPTS.maxKWidth,
    zoomLevelCount,
  })
  const currentKGap = kGapFromKWidth(currentKWidth, currentDpr)

  // -------------------------------------------------------------------
  // Controller signals (ReadonlySignal wrappers over Chart kernel signals)
  // -------------------------------------------------------------------

  const viewport = computed(() => mapViewportState(chart.viewport.peek()))

  // data/dataLoading need fallback writes for jsdom tolerance
  const data: Signal<ReadonlyArray<KLineData>> = createSignal(opts.data ?? [])
  const dataLoading = chart.loading

  const symbols = chart.symbols

  // theme needs fallback write for jsdom tolerance
  const themeSignal: Signal<'light' | 'dark'> = createSignal(opts.theme ?? 'light')

  const indicators = computed(() => chart.indicators.peek().map(mapIndicatorInstance))
  const subPanes = computed(() => chart.subPanes.peek().map(mapSubPaneInfo))
  const drawingTool = computed(() => mapDrawingTool(chart.drawingTool.peek()))
  const drawings = computed(() => chart.drawings.peek().map(mapDrawingObject))
  const paneRatios = computed(() => mapPaneRatios(chart.paneRatios.peek()))
  const paneLayout = computed(() => [...chart.paneLayout.peek()])
  const interactionState = computed(() => mapInteractionSnapshot(chart.interactionState.peek()))

  // comparisonColors/comparisonLoading — not yet migrated to kernel state
  const comparisonColors = chart.comparisonColors
  const comparisonLoading = chart.comparisonLoading

  const symbolCatalog = chart.symbolCatalog

  // -------------------------------------------------------------------
  // Apply initial render state + seed data
  // -------------------------------------------------------------------

  try {
    chart.applyRenderState(currentKWidth, currentKGap, initialZoomLevel)
  } catch {
    /* tolerate jsdom */
  }

  if (opts.data && opts.data.length > 0) {
    try {
      chart.setData([...opts.data])
    } catch {
      /* tolerate first-paint racing */
    }
  }

  // Apply initial DataFetcher
  if (opts.dataFetcher) {
    chart.setDataFetcher(opts.dataFetcher)
  }

  // Apply initial symbols
  if (opts.symbols && opts.symbols.length > 0) {
    chart.setSymbols(opts.symbols)
  }

  // Apply initial theme if non-default
  if (opts.theme && opts.theme !== 'light') {
    try {
      chart.setTheme(opts.theme)
    } catch {
      /* tolerate first-paint racing */
    }
  }

  // Apply initial settings (partial, merged with defaults)
  if (opts.settings) {
    try {
      chart.updateSettingsFacade(resolveSettings(opts.settings))
    } catch {
      /* tolerate first-paint racing */
    }
  }

  // -------------------------------------------------------------------
  // Apply initial render state + seed data
  // -------------------------------------------------------------------

  let disposed = false

  // -------------------------------------------------------------------
  // Public methods — delegate to Chart facade
  // -------------------------------------------------------------------

  function setData(next: ReadonlyArray<KLineData>): void {
    if (disposed) return
    try {
      chart.setData([...next])
    } catch {
      data.set([...next])
    }
  }

  function setSymbols(next: ReadonlyArray<SymbolSpec>): void {
    if (disposed) return
    chart.setSymbols(next)
  }

  function addComparisonSymbol(spec: SymbolSpec): void {
    if (disposed) return
    chart.addComparisonSymbol(spec)
  }

  function removeComparisonSymbol(symbol: string): void {
    if (disposed) return
    chart.removeComparisonSymbol(symbol)
  }

  function setComparisonData(symbol: string, data: ReadonlyArray<KLineData>): void {
    if (disposed) return
    chart.setComparisonData(symbol, [...data])
  }

  function setCurrentSymbol(symbol: string): void {
    if (disposed) return
    chart.setCurrentSymbol(symbol)
  }

  function setCurrentPeriod(period: string): void {
    if (disposed) return
    chart.setCurrentPeriod(period)
  }

  function switchToTimeShareForDate(dateYYYYMMDD: number): void {
    if (disposed) return
    chart.switchToTimeShareForDate(dateYYYYMMDD)
  }

  function registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    if (disposed) return
    chart.registerSymbols(infos)
  }

  function applyCustomData(source: CustomDataSource): void {
    if (disposed) return
    chart.applyCustomData(source)
  }

  function resetToFetcher(spec: SymbolSpec): void {
    if (disposed) return
    chart.resetToFetcher(spec)
  }

  function getPreCustomSpec(): SymbolSpec | null {
    if (disposed) return null
    return chart.getPreCustomSpec()
  }

  function setDataFetcher(fetcher: DataFetcher | null): void {
    if (disposed) return
    chart.setDataFetcher(fetcher)
  }

  function ensureDataRange(startTs: number): void {
    if (disposed) return
    const buf = chart.dataBuffer
    const win = buf.loadedWindow
    if (!win || startTs >= win.earliestTs) return
    buf.ensureRange(startTs, win.earliestTs)
  }

  function appendData(next: ReadonlyArray<KLineData>): void {
    if (disposed) return
    const current = data.peek()
    const merged = [...current, ...next]
    setData(merged)
  }

  function getData(): ReadonlyArray<KLineData> {
    if (disposed) return []
    return chart.getData()
  }

  function getZoomLevelCount(): number {
    if (disposed) return 0
    return chart.getZoomLevelCount()
  }

  function setTheme(nextTheme: 'light' | 'dark'): void {
    if (disposed) return
    chart.setTheme(nextTheme)
  }

  function zoomToLevel(level: number, anchorX?: number): void {
    if (disposed) return
    chart.zoomToLevel(level, anchorX)
  }

  function zoomIn(anchorX?: number): void {
    if (disposed) return
    chart.zoomIn(anchorX)
  }

  function zoomOut(anchorX?: number): void {
    if (disposed) return
    chart.zoomOut(anchorX)
  }

  function handlePointerEvent(
    e: PointerEvent,
    drawingController?: DrawingControllerCallbacks,
  ): boolean {
    if (disposed) return false
    return chart.handlePointerEvent(e, drawingController)
  }

  function handleWheelEvent(e: WheelEvent): void {
    if (disposed) return
    chart.handleWheelEvent(e)
  }

  function handleScrollEvent(): void {
    if (disposed) return
    chart.handleScrollEvent()
  }

  function handlePinchZoom(delta: number, centerClientX: number): void {
    if (disposed) return
    chart.handlePinchZoom(delta, centerClientX)
  }

  function addIndicator(
    definitionId: string,
    role: 'main' | 'sub',
    params?: Record<string, unknown>,
  ): string | null {
    if (disposed) return null
    return chart.addIndicator(definitionId, role, params)
  }

  function removeIndicator(instanceId: string): boolean {
    if (disposed) return false
    return chart.removeIndicator(instanceId)
  }

  function updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
    if (disposed) return false
    return chart.updateIndicatorParams(instanceId, params)
  }

  function updateRendererConfig(name: string, config: Record<string, unknown>): void {
    if (disposed) return
    chart.updateRendererConfig(name, config)
  }

  function setTooltipSize(size: { width: number; height: number }): void {
    if (disposed) return
    chart.interaction.setTooltipSize(size)
  }

  function setTooltipAnchorPositioning(enabled: boolean): void {
    if (disposed) return
    chart.interaction.setTooltipAnchorPositioning(enabled)
  }

  function getContentWidth(): number {
    if (disposed) return 0
    return chart.getContentWidth()
  }

  function getLeftLoadBufferWidth(): number {
    if (disposed) return 0
    return chart.getLeftLoadBufferWidth()
  }

  function scrollToRight(): void {
    if (disposed) return
    chart.scrollToRight()
  }

  function getIndicatorTitle(instanceId: string): string | undefined {
    if (disposed) return undefined
    const instances = chart.indicators.peek()
    const match = instances.find((inst) => inst.id === instanceId)
    return match?.label
  }

  function setDrawingTool(tool: DrawingToolType | null): void {
    if (disposed) return
    chart.setDrawingTool(tool)
  }

  function clearDrawings(): void {
    if (disposed) return
    chart.clearDrawings()
  }

  function removeDrawing(drawingId: string): void {
    if (disposed) return
    chart.removeDrawing(drawingId)
  }

  // ---- DrawingChartAdapter methods ----

  function setDrawings(drawings: any[]): void {
    if (disposed) return
    chart.setDrawings(drawings)
  }

  function getFullDrawings(): any[] {
    if (disposed) return []
    return chart.drawings() as any[]
  }

  function setSelectedDrawingId(id: string | null): void {
    if (disposed) return
    chart.setSelectedDrawingId(id)
  }

  function getViewport(): { scrollLeft: number; plotWidth: number; plotHeight: number } | null {
    if (disposed) return null
    const vp = chart.getViewport()
    return vp
  }

  function getKWidthKGap(): { kWidth: number; kGap: number } {
    if (disposed) return { kWidth: 0, kGap: 0 }
    const opt = chart.getOption()
    return { kWidth: opt.kWidth, kGap: opt.kGap }
  }

  function getCurrentDpr(): number {
    if (disposed) return 1
    return chart.getCurrentDpr()
  }

  function getLogicalIndexAtX(mouseX: number): number | null {
    if (disposed) return null
    return chart.getLogicalIndexAtX(mouseX)
  }

  function getTimestampAtLogicalIndex(index: number): number | null {
    if (disposed) return null
    return chart.getTimestampAtLogicalIndex(index)
  }

  function priceToY(paneId: string, price: number): number {
    if (disposed) return 0
    const renderer = chart.getPaneRenderers().find((item) => item.getPane().id === paneId)
    return renderer?.getPane().yAxis.priceToY(price) ?? 0
  }

  function yToPrice(paneId: string, y: number): number {
    if (disposed) return 0
    const renderer = chart.getPaneRenderers().find((item) => item.getPane().id === paneId)
    return renderer?.getPane().yAxis.yToPrice(y) ?? 0
  }

  function getPaneInfo(paneId: string): PaneLayoutInfo | undefined {
    if (disposed) return undefined
    const renderer = chart.getPaneRenderers().find((item) => item.getPane().id === paneId)
    const pane = renderer?.getPane()
    if (!pane) return undefined
    return { paneId: pane.id, top: pane.top, height: pane.height }
  }

  function createSubPane(
    paneId: string,
    indicatorId: string,
    params?: Record<string, unknown>,
  ): boolean {
    if (disposed) return false
    return chart.createSubPane(
      paneId,
      indicatorId as never,
      params as Record<string, string | number | boolean> | undefined,
    )
  }

  function clearSubPanes(): void {
    if (disposed) return
    chart.clearSubPanes()
  }

  function replaceSubPaneIndicator(
    paneId: string,
    indicatorId: string,
    params?: Record<string, unknown>,
  ): boolean {
    if (disposed) return false
    try {
      chart.replaceSubPaneIndicator(
        paneId,
        indicatorId as never,
        params as Record<string, string | number | boolean>,
      )
      return true
    } catch {
      return false
    }
  }

  function updatePaneLayout(panes: PaneSpec[]): void {
    if (disposed) return
    chart.updatePaneLayout(panes)
  }

  function resizeSubPane(paneId: string, deltaY: number): boolean {
    if (disposed) return false
    return chart.resizeSubPane(paneId, deltaY)
  }

  function updateCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>): void {
    if (disposed) return
    chart.updateCustomMarkers([...markers])
  }

  function clearCustomMarkers(): void {
    if (disposed) return
    chart.clearCustomMarkers()
  }

  function updateSettingsFacade(settings: Record<string, unknown>): void {
    if (disposed) return
    chart.updateSettingsFacade(settings)
  }

  function updateOptionsFacade(options: Record<string, unknown>): void {
    if (disposed) return
    chart.updateOptionsFacade(options)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    bridge?.destroy()
    try {
      void chart.destroy()
    } catch {
      /* best-effort */
    }
    try {
      mounted.cleanup()
    } catch {
      /* best-effort */
    }
  }

  // ---------------------------------------------------------------------------
  // MCP bridge (optional)
  // ---------------------------------------------------------------------------

  let bridge: ChartBridge | null = null
  if (opts.mcp) {
    const mcp = opts.mcp
    const wsUrl = mcp.wsUrl ?? 'ws://localhost:8081'
    console.info(`[MCP] Creating bridge, wsUrl=${wsUrl}`)
    bridge = new ChartBridge({
      wsUrl,
      onToolCall:
        mcp.onToolCall ??
        (() => ({
          success: false,
          error:
            'No onToolCall handler provided. Import executeTool from @363045841yyt/klinechart-ai-runtime and pass it via mcp.onToolCall.',
        })),
      autoReconnect: mcp.autoReconnect,
    })
    bridge.on('connected', () => {
      console.info(`[MCP] Bridge connected, sessionId=${bridge!.sessionId}`)
    })
    bridge.on('error', (err) => {
      console.error(`[MCP] Bridge error: ${(err as Error).message}`)
    })
    bridge.on('disconnected', () => {
      console.warn(`[MCP] Bridge disconnected`)
    })
    bridge.connect().catch((err) => {
      console.error(`[MCP] Bridge connect failed: ${(err as Error).message}`)
    })
  }

  return {
    viewport,
    data,
    dataLoading,
    symbols,
    theme: themeSignal,
    indicators,
    subPanes,
    drawingTool,
    drawings,
    paneRatios,
    paneLayout,
    interactionState,
    comparisonColors,
    comparisonLoading,
    symbolCatalog,
    catalog: DEFAULT_INDICATOR_CATALOG,
    alertController: chart.alertController,
    setSymbols,
    registerSymbols,
    addComparisonSymbol,
    removeComparisonSymbol,
    setComparisonData,
    setCurrentSymbol,
    setCurrentPeriod,
    switchToTimeShareForDate,
    applyCustomData,
    resetToFetcher,
    getPreCustomSpec,
    setDataFetcher,
    ensureDataRange,
    setData,
    appendData,
    updateData: setData,
    getData,
    getZoomLevelCount,
    setTheme,
    zoomToLevel,
    zoomIn,
    zoomOut,
    handlePointerEvent,
    handleWheelEvent,
    handleScrollEvent,
    handlePinchZoom,
    addIndicator,
    removeIndicator,
    updateIndicatorParams,
    updateRendererConfig,
    setTooltipSize,
    setTooltipAnchorPositioning,
    getIndicatorTitle,
    getContentWidth,
    getLeftLoadBufferWidth,
    scrollToRight,
    setDrawingTool,
    clearDrawings,
    removeDrawing,
    setDrawings,
    getFullDrawings,
    setSelectedDrawingId,
    getViewport,
    getKWidthKGap,
    getCurrentDpr,
    getLogicalIndexAtX,
    getTimestampAtLogicalIndex,
    priceToY,
    yToPrice,
    getPaneInfo,
    createSubPane,
    clearSubPanes,
    replaceSubPaneIndicator,
    updatePaneLayout,
    resizeSubPane,
    updateCustomMarkers,
    clearCustomMarkers,
    updateSettingsFacade,
    updateOptionsFacade,
    dispose,
  }
}
