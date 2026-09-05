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

import { Chart } from '../engine/chart'
import { DrawingDocument } from '../engine/drawing/DrawingDocument'
import { DrawingCommands } from '../engine/drawing/DrawingCommands'
import { loadBuiltinIndicators } from '../engine/indicators/registerBuiltins'
import { zoomLevelToKWidth, kGapFromKWidth } from '../engine/utils/zoom'
import { KLineChartError } from '../errors'
import { marketDataProviderRegistry } from '../data/provider/registry'
import { createChartAgentController } from '../features/agent/chartAgentController'
import { hasSubPaneRendererMetadata } from '../engine/subPaneManager'
import { createIndicatorQuery } from '../features/agent/indicator/indicatorQuery'
import { ChartBridge } from '../features/mcp/chartBridge'
import {
  createViewWorkspacePersistence,
  loadStoredViewWorkspaces,
} from './viewWorkspacePersistence'
import { resolveSettings } from '../foundation/config/chartSettings'
import { computed, type ReadonlySignal } from '../foundation/reactivity/index'
import { generateUUID } from '../foundation/utils/uuid'
import { createDefaultRendererHost, type RendererBackend } from '../rendering/render/index'

import type {
  ChartController,
  ChartMountOptions,
  ChartViewport,
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
  CustomDataSource,
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingObject,
  DrawingStyleKey,
  UpdateDrawingPatch,
} from './types'
import type {
  ChartOptions,
  ViewportState as LegacyViewportState,
  IndicatorInstance as LegacyIndicatorInstance,
  SubPaneInfo as LegacySubPaneInfo,
} from '../engine/chartTypes'
import type { CustomMarkerEntity } from '../engine/marker/registry'

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
  {
    id: 'MA',
    label: 'MA',
    name: '移动平均线',
    role: 'main',
    indicatorType: 'moving-average',
    params: [],
  },
  { id: 'BOLL', label: 'BOLL', name: '布林带', role: 'main', indicatorType: 'channel', params: [] },
  {
    id: 'EXPMA',
    label: 'EXPMA',
    name: '指数平均线',
    role: 'main',
    indicatorType: 'moving-average',
    params: [],
  },
  { id: 'ENE', label: 'ENE', name: '轨道线', role: 'main', indicatorType: 'channel', params: [] },
  { id: 'SAR', label: 'SAR', name: '抛物线', role: 'main', indicatorType: 'trend', params: [] },
  {
    id: 'SUPERTREND',
    label: 'SuperTrend',
    name: '超级趋势',
    role: 'main',
    indicatorType: 'trend',
    params: [],
  },
  {
    id: 'STRUCTURE',
    label: 'Structure',
    name: 'SMC 结构',
    role: 'main',
    indicatorType: 'structure',
    params: [],
  },
  {
    id: 'ZONES',
    label: 'Zones',
    name: 'SMC 区域',
    role: 'main',
    indicatorType: 'structure',
    params: [],
  },
  { id: 'VOLUME', label: 'VOL', name: '成交量', role: 'sub', indicatorType: 'volume', params: [] },
  { id: 'MACD', label: 'MACD', name: 'MACD', role: 'sub', indicatorType: 'momentum', params: [] },
  { id: 'RSI', label: 'RSI', name: '相对强弱', role: 'sub', indicatorType: 'momentum', params: [] },
  { id: 'CCI', label: 'CCI', name: '顺势指标', role: 'sub', indicatorType: 'momentum', params: [] },
  {
    id: 'KDJ',
    label: 'KDJ',
    name: 'KDJ',
    role: 'sub',
    indicatorType: 'momentum',
    params: [],
  },
  { id: 'MOM', label: 'MOM', name: '动量', role: 'sub', indicatorType: 'momentum', params: [] },
  {
    id: 'WMSR',
    label: 'WMSR',
    name: '威廉指标',
    role: 'sub',
    indicatorType: 'momentum',
    params: [],
  },
  {
    id: 'KST',
    label: 'KST',
    name: 'KST 振荡器',
    role: 'sub',
    indicatorType: 'momentum',
    params: [],
  },
  {
    id: 'FASTK',
    label: 'FASTK',
    name: '快速 K',
    role: 'sub',
    indicatorType: 'momentum',
    params: [],
  },
  { id: 'OBV', label: 'OBV', name: '能量潮', role: 'sub', indicatorType: 'volume', params: [] },
  {
    id: 'VWAP',
    label: 'VWAP',
    name: '成交量加权均价',
    role: 'sub',
    indicatorType: 'volume',
    params: [],
  },
  {
    id: 'VOLUME_PROFILE',
    label: 'VP',
    name: '成交量分布',
    role: 'sub',
    indicatorType: 'volume',
    params: [],
  },
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
    instanceId: subPane.instanceId,
    paneId: subPane.paneId,
    indicatorId: subPane.indicatorId,
    ordinal: subPane.ordinal,
    params: { ...subPane.params },
    ratio: subPane.ratio,
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
  const initialViewWorkspaces = loadStoredViewWorkspaces()

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

  const initialSettings = resolveSettings(opts.settings)
  const rendererHost = await createDefaultRendererHost(
    initialSettings.rendererBackend as RendererBackend,
  )
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
    {
      rendererHost,
      initialSettings,
      initialViewWorkspaces: initialViewWorkspaces ?? undefined,
      marketSessions: opts.marketSessions,
    },
  )
  chart.setViewWorkspacePersistence(
    createViewWorkspacePersistence(() => chart.kernel.snapshotViewWorkspaces()),
  )
  const drawingDocument = new DrawingDocument({
    drawingState: chart.kernel.drawing,
    getLogicalIndexAtTimestamp(timestamp) {
      return chart.getLogicalIndexAtTimestamp(timestamp)
    },
    findAnchorAtTradingDate(tradingDate) {
      const bar = chart.getData().find((item) => item.date === tradingDate)
      return bar === undefined ? null : { timestamp: bar.timestamp }
    },
    hasPaneId(paneId) {
      return chart.getPaneLayoutSpecs().some((pane) => pane.id === paneId)
    },
    getWorkspaceId() {
      return chart.getDrawingWorkspaceId()
    },
  })
  const drawingCommands = new DrawingCommands({
    document: drawingDocument,
    requestDraw: () => chart.scheduleDraw(),
  })

  if (import.meta.env?.MODE !== 'production' && typeof window !== 'undefined') {
    ;(window as any).__chart = chart
  }

  const currentDpr =
    typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  const currentKWidth = zoomLevelToKWidth(initialZoomLevel, {
    minKWidth: DEFAULT_OPTS.minKWidth,
    maxKWidth: DEFAULT_OPTS.maxKWidth,
    zoomLevelCount,
  })
  const currentKGap = kGapFromKWidth(currentKWidth, currentDpr)

  // -------------------------------------------------------------------
  // Controller signals — most come directly from ChartStateKernel
  // -------------------------------------------------------------------

  const viewport = computed(() => mapViewportState(chart.viewport()))

  const data = chart.data
  const dataLoading = chart.loading
  const dataError = chart.dataError
  const marketDataCacheStats = chart.getMarketDataCache().stats
  const symbols = chart.symbols

  const indicators = computed(() => chart.indicators().map(mapIndicatorInstance))
  const subPanes = computed(() => chart.subPanes().map(mapSubPaneInfo))

  // comparisonColors/comparisonLoading — not yet migrated to kernel state
  const comparisonColors = chart.comparisonColors
  const comparisonLoading = chart.comparisonLoading

  // 优先走 Chart facade；kernel 仅用于尚无 facade 的字段
  const themeSignal: ReadonlySignal<'light' | 'dark'> = chart.theme
  const settingsSignal = chart.kernel.settings.readonly.settings
  const rendererRuntimeSignal = chart.kernel.renderer.readonly.runtime
  const chartModeSignal = chart.kernel.mode.readonly.chartMode
  const lastBarPeriodSignal = chart.kernel.mode.readonly.lastBarPeriod
  const drawingTool = chart.drawingTool
  const drawings = chart.drawings
  const selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>> = chart.selectedDrawingIds
  const paneRatios: ReadonlySignal<Readonly<Record<string, number>>> = chart.paneRatios
  const paneLayout: ReadonlySignal<ReadonlyArray<PaneSpec>> = chart.paneLayout
  const interactionState: ReadonlySignal<InteractionSnapshot> = chart.interactionState
  const selectedRange = chart.selectedRange
  const rangeSelection = chart.rangeSelection
  const legendTemplateContext = chart.legendTemplateContext
  const symbolCatalog: ReadonlySignal<ReadonlyArray<SymbolInfo>> = chart.symbolCatalog

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

  // Apply initial symbols
  if (opts.symbols && opts.symbols.length > 0) {
    chart.setSymbols(opts.symbols)
  }

  // Apply mount theme preference (settings default may be dark — always honor explicit opts.theme)
  if (opts.theme) {
    try {
      chart.setTheme(opts.theme)
    } catch {
      /* tolerate first-paint racing */
    }
  }

  // -------------------------------------------------------------------
  // Agent facade
  // -------------------------------------------------------------------

  const agent = createChartAgentController({
    chartId: generateUUID(),
    dataState: chart.kernel.data,
    currentSpec: chart.kernel.dataManager.readonly.currentSpec,
    chartMode: chartModeSignal,
    selectedRange: chart.selectedRange,
    indicators,
    indicatorQuery: createIndicatorQuery({ dataState: chart.kernel.data }),
    marketDataProviderRegistry,
    marketDataCache: chart.getMarketDataCache(),
    drawingDocument,
    drawingCommands,
    drawings: chart.drawings,
    selectedDrawingIds: chart.selectedDrawingIds,
    getDrawingPaneIds: () => chart.getPaneLayoutSpecs().map((pane) => pane.id),
    paneManager: chart.kernel.paneManager,
    isSubPaneRendererAvailable: (indicatorId, paneId) => {
      const definition = chart.getIndicatorScheduler().getIndicatorMetadata(indicatorId)
      return definition !== undefined && hasSubPaneRendererMetadata(definition, paneId, indicatorId)
    },
  })

  let disposed = false

  // -------------------------------------------------------------------
  // Public methods — delegate to Chart facade
  // -------------------------------------------------------------------

  function setData(next: ReadonlyArray<KLineData>): void {
    if (disposed) return
    chart.setData([...next])
  }

  function setSymbols(next: ReadonlyArray<SymbolSpec>): void {
    if (disposed) return
    chart.clearRangeSelection()
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
    chart.clearRangeSelection()
    chart.setCurrentSymbol(symbol)
  }

  function setCurrentPeriod(period: string): void {
    if (disposed) return
    chart.clearRangeSelection()
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
    chart.clearRangeSelection()
    chart.applyCustomData(source)
  }

  function resetToFetcher(spec: SymbolSpec): void {
    if (disposed) return
    chart.clearRangeSelection()
    chart.resetToFetcher(spec)
  }

  function clearMarketDataCache(): void {
    if (disposed) return
    chart.getMarketDataCache().clear()
  }

  function ensureDataRange(startTs: number): void {
    if (disposed) return
    const buf = chart.dataBuffer
    const loadedTimeRange = buf.loadedTimeRange
    if (!loadedTimeRange || startTs >= loadedTimeRange.earliestTs) return
    chart.ensureDataRange(startTs)
  }

  function startRangeSelection(timestamp: number): void {
    if (disposed) return
    chart.startRangeSelection(timestamp)
  }

  function updateRangeSelection(timestamp: number): void {
    if (disposed) return
    chart.updateRangeSelection(timestamp)
  }

  function finishRangeSelection(timestamp?: number): void {
    if (disposed) return
    chart.finishRangeSelection(timestamp)
  }

  function setRangeSelection(startTimestamp: number, endTimestamp: number): void {
    if (disposed) return
    chart.setRangeSelection(startTimestamp, endTimestamp)
  }

  function clearRangeSelection(): void {
    if (disposed) return
    chart.clearRangeSelection()
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

  function setSystemTheme(nextTheme: 'light' | 'dark'): void {
    if (disposed) return
    chart.setSystemTheme(nextTheme)
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

  function setDrawingTool(tool: import('../engine/drawing/toolConfig').DrawingToolId | null): void {
    if (disposed) return
    chart.setDrawingTool(tool)
  }

  function setDrawingToolId(toolId: import('../engine/drawing/toolConfig').DrawingToolId): void {
    if (disposed) return
    chart.setDrawingTool(toolId)
  }

  function getDrawingToolId(): import('../engine/drawing/toolConfig').DrawingToolId {
    if (disposed) return 'cursor'
    return chart.kernel.drawing.readonly.drawingTool.peek()
  }

  function registerDrawingSession(session: unknown | null): void {
    if (disposed) return
    chart.registerDrawingSession(
      session as import('../engine/drawing/interaction').DrawingInteractionController | null,
    )
  }

  function clearDrawings(): void {
    if (disposed) return
    drawingCommands.clear()
  }

  function createDrawing(input: CreateDrawingInput): DrawingObject {
    if (disposed) throw new Error('Chart controller has been disposed.')
    return drawingCommands.create(input)
  }

  function updateDrawing(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    if (disposed) return null
    return drawingCommands.update(id, patch)
  }

  function commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<import('../foundation/plugin').PersistedDrawingAnchor>,
  ): DrawingObject | null {
    if (disposed) return null
    return drawingCommands.commitDrag(id, anchors)
  }

  function updateBatch(
    ids: ReadonlyArray<string>,
    patch: BatchDrawingPatch,
  ): ReadonlyArray<DrawingObject> {
    if (disposed) return []
    return drawingCommands.updateBatch(ids, patch)
  }

  function getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey> {
    if (disposed) return []
    return drawingDocument.getBatchStyleKeys(ids)
  }

  function removeDrawing(drawingId: string): boolean {
    if (disposed) return false
    return drawingCommands.remove(drawingId)
  }

  function removeBatch(ids: ReadonlyArray<string>): boolean {
    if (disposed) return false
    return drawingCommands.removeBatch(ids)
  }

  function replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    if (disposed) return
    drawingCommands.replace(drawings)
  }

  // ---- DrawingChartAdapter methods ----

  function getFullDrawings(): ReadonlyArray<DrawingObject> {
    if (disposed) return []
    return drawingDocument.listDrawings()
  }

  function requestDraw(): void {
    if (disposed) return
    chart.scheduleDraw()
  }

  function setSelectedDrawingIds(ids: ReadonlyArray<string>): void {
    if (disposed) return
    chart.setSelectedDrawingIds(ids)
  }

  function getSelectedDrawingIds(): ReadonlyArray<string> {
    if (disposed) return []
    return chart.selectedDrawingIds.peek()
  }

  function getViewport(): { scrollLeft: number; plotWidth: number; plotHeight: number } | null {
    if (disposed) return null
    const vp = chart.getViewport()
    return vp
  }

  function getKWidthKGap(): { kWidth: number; kGap: number } {
    if (disposed) return { kWidth: 0, kGap: 0 }
    return {
      kWidth: chart.kernel.zoom.readonly.kWidth.peek(),
      kGap: chart.kernel.viewport.readonly.kGap.peek(),
    }
  }

  function getCurrentDpr(): number {
    if (disposed) return 1
    return chart.getCurrentDpr()
  }

  function getLogicalIndexAtX(mouseX: number): number | null {
    if (disposed) return null
    return chart.getLogicalIndexAtX(mouseX)
  }

  function getScreenXAtLogicalIndex(index: number): number | null {
    if (disposed) return null
    return chart.getScreenXAtLogicalIndex(index)
  }

  function getTimestampAtLogicalIndex(index: number): number | null {
    if (disposed) return null
    return chart.getTimestampAtLogicalIndex(index)
  }

  function getDrawingData(): ReadonlyArray<{ timestamp: number }> {
    if (disposed) return []
    return chart.getDrawingData()
  }

  function getDrawingTimestampAtLogicalIndex(index: number): number | null {
    if (disposed) return null
    return chart.getDrawingTimestampAtLogicalIndex(index)
  }

  function getLogicalIndexAtTimestamp(timestamp: number): number | null {
    if (disposed) return null
    return chart.getLogicalIndexAtTimestamp(timestamp)
  }

  function getDrawingWorkspaceId(): import('../foundation/plugin').DrawingWorkspaceId {
    if (disposed) return 'kline'
    return chart.getDrawingWorkspaceId()
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

  function getPaneAtY(y: number): PaneLayoutInfo | undefined {
    if (disposed) return undefined
    const renderer = chart
      .getPaneRenderers()
      .find((item) => y >= item.getPane().top && y <= item.getPane().top + item.getPane().height)
    const pane = renderer?.getPane()
    return pane ? { paneId: pane.id, top: pane.top, height: pane.height } : undefined
  }

  function createPane(input: import('../engine/paneManager').CreatePaneInput): boolean {
    if (disposed) return false
    return chart.createPane(input)
  }

  function clearPanes(): void {
    if (disposed) return
    chart.clearPanes()
  }

  function replacePaneContent(
    paneId: string,
    indicatorId: string,
    params: Record<string, unknown>,
  ): boolean {
    if (disposed) return false
    return chart.replacePaneContent(paneId, indicatorId, params)
  }

  function updatePaneContent(paneId: string, params: Record<string, unknown>): boolean {
    if (disposed) return false
    return chart.updatePaneContent(paneId, params)
  }

  function updatePane(paneId: string, patch: import('../engine/paneManager').PanePatch): boolean {
    if (disposed) return false
    return chart.updatePane(paneId, patch)
  }

  function removePane(paneId: string): boolean {
    if (disposed) return false
    return chart.removePane(paneId)
  }

  function movePane(paneId: string, targetIndex: number): boolean {
    if (disposed) return false
    return chart.movePane(paneId, targetIndex)
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
    agent,
    viewport,
    data,
    dataLoading,
    dataError,
    marketDataCacheStats,
    symbols,
    theme: themeSignal,
    settings: settingsSignal,
    rendererRuntime: rendererRuntimeSignal,
    chartMode: chartModeSignal,
    lastBarPeriod: lastBarPeriodSignal,
    indicators,
    subPanes,
    drawingTool,
    drawings,
    selectedDrawingIds,
    paneRatios,
    paneLayout,
    interactionState,
    selectedRange,
    rangeSelection,
    legendTemplateContext,
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
    clearMarketDataCache,
    resetToFetcher,
    ensureDataRange,
    startRangeSelection,
    updateRangeSelection,
    finishRangeSelection,
    setRangeSelection,
    clearRangeSelection,
    setData,
    appendData,
    updateData: setData,
    getData,
    getZoomLevelCount,
    setTheme,
    setSystemTheme,
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
    setDrawingToolId,
    getDrawingToolId,
    registerDrawingSession,
    clearDrawings,
    createDrawing,
    updateDrawing,
    commitDrawingDrag,
    updateBatch,
    getBatchStyleKeys,
    removeDrawing,
    removeBatch,
    replaceDrawings,
    getFullDrawings,
    requestDraw,
    setSelectedDrawingIds,
    getSelectedDrawingIds,
    getViewport,
    getKWidthKGap,
    getCurrentDpr,
    getLogicalIndexAtX,
    getScreenXAtLogicalIndex,
    getTimestampAtLogicalIndex,
    getDrawingData,
    getDrawingTimestampAtLogicalIndex,
    getLogicalIndexAtTimestamp,
    getDrawingWorkspaceId,
    priceToY,
    yToPrice,
    getPaneInfo,
    getPaneAtY,
    createPane,
    clearPanes,
    replacePaneContent,
    updatePaneContent,
    updatePane,
    removePane,
    movePane,
    updateCustomMarkers,
    clearCustomMarkers,
    updateSettingsFacade,
    updateOptionsFacade,
    dispose,
  }
}
