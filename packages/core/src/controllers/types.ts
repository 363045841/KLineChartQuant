/**
 * Framework-agnostic controller interfaces.
 *
 * Every adapter (React, Vue, Angular) consumes these. Controllers expose state as
 * `ReadonlySignal<T>` so adapters bridge with their own reactivity (useSyncExternalStore,
 * shallowRef, toSignal).
 *
 * Mutation methods are imperative — adapters call them in event handlers.
 */

import type { AlertController } from '../features/alerts/types'
import type { ChartSettings } from '../foundation/config/chartSettings'
import type { InteractionSnapshot } from '../engine/chart'
import type { PaneSpec } from '../engine/chartTypes'
import type { CustomMarkerEntity } from '../engine/marker/registry'
import type { ReadonlySignal, Signal } from '../foundation/reactivity/index'

// Controller-owned public surface. Legacy engine types may mirror these
// shapes internally, but adapters depend only on core-defined contracts.
export interface ChartViewport {
  zoomLevel: number
  plotWidth: number
  plotHeight: number
  dpr: number
  visibleFrom: number
  visibleTo: number
  kWidth: number
  kGap: number
}

export type IndicatorRole = 'main' | 'sub'

export interface IndicatorInstance {
  id: string
  definitionId: string
  label: string
  name: string
  role: IndicatorRole
  paneId?: string
  params: Record<string, unknown>
}

export interface SubPaneInfo {
  paneId: string
  indicatorId: string
  params: Record<string, unknown>
  ratio: number
}

export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'

export interface DrawingObject {
  id: string
  type: DrawingToolType
}

export type IndicatorPaneRole = IndicatorRole

// ---------------------------------------------------------------------------
// Data shapes (mirror src/types/price.ts — single source of truth lives here
// long-term; the legacy types re-export from here once migration completes)
// ---------------------------------------------------------------------------

export interface KLineData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
  symbol?: string
  amplitude?: number
  changePercent?: number
  changeAmount?: number
  turnoverRate?: number
  date?: string
}

export interface TimeShareData {
  timestamp: number
  price: number
  average: number
  volume: number
  amount: number
}

export type { PaneSpec }

// ---------------------------------------------------------------------------
/** Registered symbol metadata — for the symbol catalog/dropdown UI */
export interface SymbolInfo {
  symbol: string
  description?: string
  exchange?: string
  source?: string
}

// Symbol specification & DataFetcher adapter
// ---------------------------------------------------------------------------

export interface SymbolSpec {
  symbol: string
  exchange?: string
  period?: string
  adjust?: string
  source?: string
  startDate?: string
  endDate?: string
  /**
   * Whether incremental loading is supported for this symbol.
   * When false, the data buffer will not fetch additional data
   * beyond what was initially provided (e.g. via setInlineData).
   * Defaults to true when not set.
   */
  incremental?: boolean
}

export type DataFetcher = (
  source: string,
  config: {
    symbol: string
    startDate: string
    endDate: string
    period: string
    adjust: string
    exchange?: string
  },
) => Promise<ReadonlyArray<KLineData>>

/** User-provided K-line data bundle — bypasses the fetcher pipeline entirely */
export interface CustomDataSource {
  symbol?: string
  period?: string
  adjust?: string
  /** Display description for the symbol catalog (defaults to symbol code) */
  description?: string
  /** Exchange code for the symbol catalog */
  exchange?: string
  /** Data source label for the symbol catalog */
  source?: string
  /** Main chart K-line data (required) */
  data: ReadonlyArray<KLineData>
  /** Comparison products keyed by symbol */
  comparisons?: Record<string, ReadonlyArray<KLineData>>
}

// ---------------------------------------------------------------------------
// Indicator metadata
// ---------------------------------------------------------------------------

export interface IndicatorParamDef {
  key: string
  label: string
  type: 'number' | 'string' | 'boolean' | 'color' | 'select'
  default: number | string | boolean
  min?: number
  max?: number
  step?: number
  options?: ReadonlyArray<{ value: string; label: string }>
}

export interface IndicatorDefinition {
  id: string
  label: string
  name?: string
  description?: string
  role: IndicatorPaneRole
  params: ReadonlyArray<IndicatorParamDef>
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

export type { InteractionSnapshot }

// ---------------------------------------------------------------------------
// Pane info (read-only pane metadata for DrawingChartAdapter)
// ---------------------------------------------------------------------------

export interface PaneLayoutInfo {
  paneId: string
  top: number
  height: number
}

// ---------------------------------------------------------------------------
// Drawing adapter — narrow interface for DrawingInteractionController
// ---------------------------------------------------------------------------

export interface DrawingChartViewport {
  scrollLeft: number
  plotWidth: number
  plotHeight: number
}

export interface DrawingChartAdapter {
  /** persist full drawing list to the chart engine */
  setDrawings(drawings: any[]): void
  /** read the full drawing list (plugin-level DrawingObject) */
  getFullDrawings(): any[]
  /** highlight a drawing by ID */
  setSelectedDrawingId(id: string | null): void
  /** read selected drawing id from kernel */
  getSelectedDrawingId(): string | null
  /** write drawing tool id via Chart (kernel SSOT + session side effects) */
  setDrawingToolId(toolId: import('../engine/drawing/toolConfig').DrawingToolId): void
  /** read current drawing tool id from kernel */
  getDrawingToolId(): import('../engine/drawing/toolConfig').DrawingToolId
  /**
   * 会话态变更后请求重绘（不写 kernel）。
   * 预览 / 拖拽中间态只改会话层时调用。
   */
  requestDraw?(): void
  /** current viewport (nullable if chart not ready) */
  getViewport(): DrawingChartViewport | null
  /** resolved chart options (kWidth, kGap) */
  getKWidthKGap(): { kWidth: number; kGap: number }
  /** device pixel ratio */
  getCurrentDpr(): number
  /** raw K-line data */
  getData(): ReadonlyArray<KLineData>
  /** screen-x → logical bar index */
  getLogicalIndexAtX(mouseX: number): number | null
  /** logical index → unix timestamp (ms) */
  getTimestampAtLogicalIndex(index: number): number | null
  /** price → Y within the given pane */
  priceToY(paneId: string, price: number): number
  /** Y within the given pane → price */
  yToPrice(paneId: string, y: number): number
  /** read-only pane metadata by pane ID */
  getPaneInfo(paneId: string): PaneLayoutInfo | undefined
}

// ---------------------------------------------------------------------------
// Drawing controller callback type (passed to handlePointerEvent)
// ---------------------------------------------------------------------------

export interface DrawingControllerCallbacks {
  onPointerDown?: (e: PointerEvent, container: HTMLElement) => boolean
  onPointerMove?: (e: PointerEvent, container: HTMLElement) => boolean
  onPointerUp?: (e: PointerEvent, container: HTMLElement) => boolean
}

// ---------------------------------------------------------------------------
// ChartController — top-level facade; what `useChart` / `<KLineChart>` expose
// ---------------------------------------------------------------------------

export interface ChartMountOptions {
  container: HTMLElement
  data?: ReadonlyArray<KLineData>
  symbols?: ReadonlyArray<SymbolSpec>
  dataFetcher?: DataFetcher
  initialZoomLevel?: number
  zoomLevels?: number
  theme?: 'light' | 'dark'

  // Pre-existing DOM elements (skip buildDom when provided)
  canvasLayer?: HTMLElement
  rightAxisLayer?: HTMLElement
  leftAxisLayer?: HTMLElement
  xAxisCanvas?: HTMLCanvasElement

  // Chart options overrides
  yPaddingPx?: number
  rightAxisWidth?: number
  leftAxisWidth?: number
  bottomAxisHeight?: number
  priceLabelWidth?: number
  minKWidth?: number
  maxKWidth?: number

  // Initial chart settings (partial, merged with DEFAULT_SETTINGS)
  settings?: Partial<ChartSettings>

  // MCP / AI runtime bridge
  mcp?: {
    wsUrl?: string
    onToolCall?: (call: {
      name: string
      input: Record<string, unknown>
    }) =>
      | Promise<{ success: boolean; error?: string; data?: unknown }>
      | { success: boolean; error?: string; data?: unknown }
    autoReconnect?: boolean
  }
}

export interface ChartController extends DrawingChartAdapter {
  // ---- Signals ----
  readonly viewport: ReadonlySignal<ChartViewport>
  readonly data: ReadonlySignal<ReadonlyArray<KLineData>>
  readonly dataLoading: ReadonlySignal<boolean>
  readonly symbols: ReadonlySignal<ReadonlyArray<SymbolSpec>>
  readonly theme: ReadonlySignal<'light' | 'dark'>
  /** 用户偏好 settings（kernel.settings resolved 快照） */
  readonly settings: ReadonlySignal<
    Readonly<import('../foundation/config/chartSettings').ChartSettings>
  >
  /** 当前有效 renderer、切换状态和最近错误。 */
  readonly rendererRuntime: ReadonlySignal<
    Readonly<import('../rendering/render/rendererHost').RendererBackendRuntime>
  >
  /** 图表模式 id：kline | timeshare */
  readonly chartMode: ReadonlySignal<'kline' | 'timeshare'>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly subPanes: ReadonlySignal<ReadonlyArray<SubPaneInfo>>
  /** 当前绘图工具（DrawingToolId，默认 cursor） */
  readonly drawingTool: ReadonlySignal<import('../engine/drawing/toolConfig').DrawingToolId>
  readonly drawings: ReadonlySignal<ReadonlyArray<DrawingObject>>
  /** 当前选中绘图 id（kernel.drawing SSOT） */
  readonly selectedDrawingId: ReadonlySignal<string | null>
  readonly paneRatios: ReadonlySignal<Readonly<Record<string, number>>>
  readonly paneLayout: ReadonlySignal<ReadonlyArray<PaneSpec>>
  readonly interactionState: ReadonlySignal<InteractionSnapshot>
  /**
   * 主图左上角图例模板上下文。
   * Vue `#legend` slot 等外部模板消费；null 表示当前帧无图例数据。
   */
  readonly legendTemplateContext: ReadonlySignal<
    import('../engine/renderers/Indicator/mainIndicatorLegendContext').LegendTemplateContext | null
  >
  readonly comparisonColors: ReadonlySignal<ReadonlyMap<string, string>>
  readonly comparisonLoading: ReadonlySignal<boolean>

  /** Registered symbol catalog — adapters use for picker UI */
  readonly symbolCatalog: ReadonlySignal<ReadonlyArray<SymbolInfo>>

  // indicator catalog (static — adapters use for picker UI)
  readonly catalog: ReadonlyArray<IndicatorDefinition>

  // ---- Alerts ----
  readonly alertController: AlertController

  // ---- Data ----
  setSymbols(next: ReadonlyArray<SymbolSpec>): void
  /** Register symbols into the available symbol catalog for UI pickers */
  registerSymbols(symbols: ReadonlyArray<SymbolInfo>): void
  addComparisonSymbol(spec: SymbolSpec): void
  removeComparisonSymbol(symbol: string): void
  /** Inject comparison product data directly (bypasses fetcher) */
  setComparisonData(symbol: string, data: ReadonlyArray<KLineData>): void
  /** Update the main symbol code without triggering a fetch */
  setCurrentSymbol(symbol: string): void
  /** Update the K-line period without triggering a fetch */
  setCurrentPeriod(period: string): void
  /** Switch to time-share view for a specific date (YYYYMMDD), e.g. after double-clicking a daily bar */
  switchToTimeShareForDate(dateYYYYMMDD: number): void
  /** Inject a complete custom data bundle (bypasses fetcher pipeline) */
  applyCustomData(source: CustomDataSource): void
  resetToFetcher(spec: SymbolSpec): void
  getPreCustomSpec(): SymbolSpec | null
  setDataFetcher(fetcher: DataFetcher | null): void
  setData(next: ReadonlyArray<KLineData>): void
  appendData(next: ReadonlyArray<KLineData>): void
  updateData(next: ReadonlyArray<KLineData>): void
  getData(): ReadonlyArray<KLineData>
  getZoomLevelCount(): number
  /** Request data for dates earlier than the currently loaded window */
  ensureDataRange(startTs: number): void

  // ---- Theme ----
  /** 设置主题偏好 light|dark（写 settings） */
  setTheme(theme: 'light' | 'dark'): void
  /** 注入系统主题（settings.theme === auto 时驱动 effectiveTheme） */
  setSystemTheme(theme: 'light' | 'dark'): void

  // ---- Zoom ----
  zoomToLevel(level: number, anchorX?: number): void
  zoomIn(anchorX?: number): void
  zoomOut(anchorX?: number): void

  // ---- Interaction ----
  handlePointerEvent(e: PointerEvent, drawingController?: DrawingControllerCallbacks): boolean
  handleWheelEvent(e: WheelEvent): void
  handleScrollEvent(): void
  handlePinchZoom(delta: number, centerClientX: number): void

  // ---- Indicators ----
  addIndicator(
    definitionId: string,
    role: 'main' | 'sub',
    params?: Record<string, unknown>,
  ): string | null
  removeIndicator(instanceId: string): boolean
  updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean
  updateRendererConfig(name: string, config: Record<string, unknown>): void

  // ---- Drawing ----
  /**
   * 设置绘图工具。接受 DrawingToolId 或 legacy DrawingToolType；
   * null 视为 cursor。
   */
  setDrawingTool(
    tool:
      | import('../engine/drawing/toolConfig').DrawingToolId
      | DrawingToolType
      | null,
  ): void
  setDrawingToolId(toolId: import('../engine/drawing/toolConfig').DrawingToolId): void
  getDrawingToolId(): import('../engine/drawing/toolConfig').DrawingToolId
  /** 注册绘图交互会话到 Chart，使工具切换能清会话副作用 */
  registerDrawingSession(session: unknown | null): void
  clearDrawings(): void
  removeDrawing(drawingId: string): void

  // ---- Layout ----
  resizeSubPane(paneId: string, deltaY: number): boolean
  createSubPane(paneId: string, indicatorId: string, params?: Record<string, unknown>): boolean
  clearSubPanes(): void
  replaceSubPaneIndicator(
    paneId: string,
    indicatorId: string,
    params?: Record<string, unknown>,
  ): boolean
  updatePaneLayout(panes: PaneSpec[]): void

  // ---- Drawing / Markers ----
  updateCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>): void
  clearCustomMarkers(): void

  // ---- Interaction sub-methods ----
  setTooltipSize(size: { width: number; height: number }): void
  setTooltipAnchorPositioning(enabled: boolean): void

  // ---- Narrow queries ----
  getIndicatorTitle(instanceId: string): string | undefined
  /** total scrollable content width (replaces direct computeContentWidth imports) */
  getContentWidth(): number
  /** left buffer width (viewport width) for pixel offset calculations */
  getLeftLoadBufferWidth(): number
  /** scroll to the rightmost position (latest data) */
  scrollToRight(): void

  // ---- Settings ----
  updateSettingsFacade(settings: Record<string, unknown>): void
  updateOptionsFacade(options: Record<string, unknown>): void

  /** tear down DOM + listeners; idempotent */
  dispose(): void
}

/**
 * Factory contract — adapters call this on mount.
 *
 * Implementation lives in packages/core/src/controllers/createChartController.ts
 * (Phase 1 deliverable). It wires the existing Chart engine in src/core/chart.ts.
 */
export type ChartControllerFactory = (opts: ChartMountOptions) => Promise<ChartController>

// ---------------------------------------------------------------------------
// Legacy type aliases (deprecated — kept for internal sub-controller tests)
// ---------------------------------------------------------------------------

export interface ActiveIndicator {
  id: string
  definitionId: string
  label: string
  name: string
  role: IndicatorPaneRole
  params: Readonly<Record<string, number | string | boolean>>
}

export interface IndicatorSelectorController {
  readonly catalog: Signal<ReadonlyArray<IndicatorDefinition>>
  readonly active: Signal<ReadonlyArray<ActiveIndicator>>
  readonly menuOpen: Signal<boolean>
  readonly searchQuery: Signal<string>
  readonly filteredMain: Signal<ReadonlyArray<IndicatorDefinition>>
  readonly filteredSub: Signal<ReadonlyArray<IndicatorDefinition>>
  add(definitionId: string): string | null
  remove(instanceId: string): boolean
  updateParams(instanceId: string, params: Record<string, number | string | boolean>): boolean
  reorder(fromInstanceId: string, toInstanceId: string): boolean
  openMenu(): void
  closeMenu(): void
  toggleMenu(): void
  setSearchQuery(q: string): void
  isActive(definitionId: string): boolean
  dispose(): void
}

export type ToolId = string

export interface ToolDefinition {
  id: ToolId
  label: string
  icon?: string
  group?: string
  disabled?: boolean
}

export interface ToolbarController {
  readonly tools: Signal<ReadonlyArray<ToolDefinition>>
  readonly activeTool: Signal<ToolId | null>
  readonly disabledTools: Signal<ReadonlySet<ToolId>>
  selectTool(id: ToolId): void
  clearSelection(): void
  setDisabled(id: ToolId, disabled: boolean): void
  dispose(): void
}

export interface DrawingState {
  readonly activeTool: DrawingToolType | null
  readonly drawingCount: number
}

export interface DrawingController {
  readonly state: Signal<DrawingState>
  setActiveTool(tool: DrawingToolType | null): void
  clearAll(): void
  deleteLast(): void
  dispose(): void
}
