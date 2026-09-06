/**
 * Framework-agnostic controller interfaces.
 *
 * Every adapter (React, Vue, Angular) consumes these. Controllers expose state as
 * `ReadonlySignal<T>` so adapters bridge with their own reactivity (useSyncExternalStore,
 * shallowRef, toSignal).
 *
 * Mutation methods are imperative — adapters call them in event handlers.
 */

import type {
  AssetClass,
  InstrumentCapabilities,
  InstrumentDescriptor,
} from '../data/provider/types'
import type { InteractionSnapshot } from '../engine/chart'
import type { PaneSpec } from '../engine/chartTypes'
import type { CreatePaneInput, PanePatch } from '../engine/paneManager'
import type { DrawingToolId } from '../engine/drawing/toolConfig'
import type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingStyleKey,
  UpdateDrawingPatch,
} from '../engine/drawing/DrawingDocument'
import type { CustomMarkerEntity } from '../engine/marker/registry'
import type { ChartAgentController } from '../features/agent/types'
import type { AlertController } from '../features/alerts/types'
import type { ChartSettings } from '../foundation/config/chartSettings'
import type {
  PersistedDrawingAnchor,
  DrawingObject as PluginDrawingObject,
} from '../foundation/plugin/index'
import type { ReadonlySignal, Signal } from '../foundation/reactivity/index'
import type { ChartDataView } from '../foundation/types/chartView'
export {
  FIVE_DAY_TIME_SHARE_DAYS,
  FIVE_DAY_TIME_SHARE_PERIOD,
  isTimeSharePeriod,
  TIME_SHARE_PERIOD,
} from '../foundation/types/chartPeriod'
import type { MarketSessionConfig } from '../foundation/utils/sessionTimeLabels'

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

/** 组件受控指标实例配置。 */
export interface ChartIndicatorConfig {
  definitionId: string
  role: IndicatorRole
  enabled: boolean
  params?: Record<string, unknown>
}

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
  instanceId: string
  paneId: string
  indicatorId: string
  ordinal: number
  params: Record<string, unknown>
  ratio: number
}

export type DrawingObject = PluginDrawingObject
export type { BatchDrawingPatch, CreateDrawingInput, DrawingStyleKey, UpdateDrawingPatch }

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
  /** 分时成交量，单位手；上游未提供时缺失。 */
  volume?: number
  /** 分时成交额，单位元；上游未提供时缺失。 */
  amount?: number
}

export type { PaneSpec }

// ---------------------------------------------------------------------------
export type DataSourceParams = Readonly<Record<string, string | number | boolean>>

/** Registered symbol metadata — for the symbol catalog/dropdown UI */
export interface SymbolInfo {
  /** 统一行情模型提供的稳定品种 ID；旧目录结果可暂时缺失。 */
  id?: string
  assetClass?: AssetClass
  sessionId?: string
  capabilities?: InstrumentCapabilities
  symbol: string
  market: string
  description?: string
  exchange?: string
  source?: string
  params?: DataSourceParams
}

// Symbol specification
// ---------------------------------------------------------------------------

export interface SymbolSpec {
  /** 统一行情模型提供的稳定品种 ID；旧调用可暂时缺失。 */
  id?: string
  /** 已选品种的统一领域模型；Provider 加载时必须原样使用。 */
  instrument?: InstrumentDescriptor
  symbol: string
  market: string
  exchange?: string
  period?: string
  adjust?: string
  source?: string
  params?: DataSourceParams
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

/** User-provided K-line data bundle — bypasses the fetcher pipeline entirely */
export interface CustomDataSource {
  market: string
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
  indicatorType: import('../engine/indicators/indicatorMetadata').IndicatorType
  indicatorTypeLabel?: string
  indicatorTypeOrder?: number
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
  /** 原子替换完整绘图文档，仅供受控组件和导入导出使用。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void
  /** read the full drawing list (plugin-level DrawingObject) */
  getFullDrawings(): ReadonlyArray<DrawingObject>
  /** 创建一个已确认图元。 */
  createDrawing(input: CreateDrawingInput): DrawingObject
  /** 以完整模型快照更新一个已确认图元。 */
  updateDrawing(drawing: DrawingObject): DrawingObject | null
  /** 提交交互层拖拽后的已解析锚点。 */
  commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): DrawingObject | null
  /** 原子更新一批图元的公共属性。 */
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject>
  /** 返回一批图元共同拥有的样式字段。 */
  getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey>
  /** 移除一个已确认图元。 */
  removeDrawing(drawingId: string): boolean
  /** 原子移除一批图元。 */
  removeBatch(ids: ReadonlyArray<string>): boolean
  /** 清除所有已确认图元。 */
  clearDrawings(): void
  /** 设置当前选中图元集合。 */
  setSelectedDrawingIds(ids: ReadonlyArray<string>): void
  /** 读取当前选中图元集合。 */
  getSelectedDrawingIds(): ReadonlyArray<string>
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
  /** K 线数据，仅供依赖 OHLC 的绘图定义计算。 */
  getData(): ReadonlyArray<KLineData>
  /** 当前绘制数据点，仅用于绘图坐标解析。 */
  getDrawingData(): ReadonlyArray<{ timestamp: number }>
  /** screen-x → logical bar index */
  getLogicalIndexAtX(mouseX: number): number | null
  /** logical bar index → current-frame screen x */
  getScreenXAtLogicalIndex(index: number): number | null
  /** 逻辑索引对应当前绘制数据点的时间戳（ms）。 */
  getDrawingTimestampAtLogicalIndex(index: number): number | null
  /** unix timestamp (ms) → current logical index */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
  /** 当前绘图所属的数据工作区。 */
  getDrawingWorkspaceId(): import('../foundation/plugin').DrawingWorkspaceId
  /** price → Y within the given pane */
  priceToY(paneId: string, price: number): number
  /** Y within the given pane → price */
  yToPrice(paneId: string, y: number): number
  /** read-only pane metadata by pane ID */
  getPaneInfo(paneId: string): PaneLayoutInfo | undefined
  /** 根据图表局部 Y 坐标查找所属 Pane。 */
  getPaneAtY(y: number): PaneLayoutInfo | undefined
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
  initialZoomLevel?: number
  zoomLevels?: number
  theme?: 'light' | 'dark'
  marketSessions?: Readonly<Record<string, MarketSessionConfig>>

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
  /** Stable, serializable Agent context and deterministic query facade. */
  readonly agent: ChartAgentController
  // ---- Signals ----
  readonly viewport: ReadonlySignal<ChartViewport>
  readonly data: ReadonlySignal<ReadonlyArray<KLineData>>
  readonly dataLoading: ReadonlySignal<boolean>
  /** 主品种最近一次显式拉取失败原因；成功或重置后为 null */
  readonly dataError: ReadonlySignal<string | null>
  /** 图表实例缓存的近似内存使用量与配置上限。 */
  readonly marketDataCacheStats: ReadonlySignal<
    import('../data/buffer/marketDataCache').MarketDataCacheStats
  >
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
  /** 图表模式 id：kline | timeshare | fiveDayTimeShare | comparison */
  readonly chartMode: ReadonlySignal<ChartDataView>
  /** 最近一次 K 线周期；分时返回操作使用该值。 */
  readonly lastBarPeriod: ReadonlySignal<string>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly subPanes: ReadonlySignal<ReadonlyArray<SubPaneInfo>>
  /** 当前绘图工具（DrawingToolId，默认 cursor） */
  readonly drawingTool: ReadonlySignal<import('../engine/drawing/toolConfig').DrawingToolId>
  readonly drawings: ReadonlySignal<ReadonlyArray<DrawingObject>>
  /** 当前选中绘图 id 集合（kernel.drawing SSOT） */
  readonly selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>>
  readonly paneRatios: ReadonlySignal<Readonly<Record<string, number>>>
  readonly paneLayout: ReadonlySignal<ReadonlyArray<PaneSpec>>
  readonly interactionState: ReadonlySignal<InteractionSnapshot>
  /** 区间选择工具确认的时间范围。 */
  readonly selectedRange: ReadonlySignal<{ from: number; to: number } | null>
  /** 区间选择工具的完整权威状态。 */
  readonly rangeSelection: ReadonlySignal<{
    startTimestamp: number | null
    endTimestamp: number | null
    isDragging: boolean
  }>
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
  /** 清除当前图表实例的行情缓存。 */
  clearMarketDataCache(): void
  resetToFetcher(spec: SymbolSpec): void
  setData(next: ReadonlyArray<KLineData>): void
  appendData(next: ReadonlyArray<KLineData>): void
  updateData(next: ReadonlyArray<KLineData>): void
  getData(): ReadonlyArray<KLineData>
  /** 返回 K 线逻辑索引对应的时间戳，供双击切换分时等 UI 操作使用。 */
  getTimestampAtLogicalIndex(index: number): number | null
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
  /** 开始区间选择。 */
  startRangeSelection(timestamp: number): void
  /** 更新区间选择终点。 */
  updateRangeSelection(timestamp: number): void
  /** 结束区间选择。 */
  finishRangeSelection(timestamp?: number): void
  /** 原子设置已确认的区间边界。 */
  setRangeSelection(startTimestamp: number, endTimestamp: number): void
  /** 清除区间选择。 */
  clearRangeSelection(): void

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
   * 设置绘图工具；null 视为 cursor。
   */
  setDrawingTool(tool: DrawingToolId | null): void
  setDrawingToolId(toolId: import('../engine/drawing/toolConfig').DrawingToolId): void
  getDrawingToolId(): import('../engine/drawing/toolConfig').DrawingToolId
  /** 注册绘图交互会话到 Chart，使工具切换能清会话副作用 */
  registerDrawingSession(session: unknown | null): void
  clearDrawings(): void
  createDrawing(input: CreateDrawingInput): DrawingObject
  updateDrawing(drawing: DrawingObject): DrawingObject | null
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject>
  getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey>
  removeDrawing(drawingId: string): boolean
  removeBatch(ids: ReadonlyArray<string>): boolean
  /** 原子替换完整绘图文档，仅供受控组件和导入导出使用。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void

  // ---- Pane ----
  createPane(input: CreatePaneInput): boolean
  updatePane(paneId: string, patch: PanePatch): boolean
  removePane(paneId: string): boolean
  movePane(paneId: string, targetIndex: number): boolean
  replacePaneContent(paneId: string, indicatorId: string, params: Record<string, unknown>): boolean
  updatePaneContent(paneId: string, params: Record<string, unknown>): boolean
  clearPanes(): void

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
export type ChartControllerFactory = (
  opts: ChartMountOptions,
) => ChartController | Promise<ChartController>

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
  readonly activeTool: DrawingToolId | null
  readonly drawingCount: number
}

export interface DrawingController {
  readonly state: Signal<DrawingState>
  setActiveTool(tool: DrawingToolId | null): void
  clearAll(): void
  deleteLast(): void
  dispose(): void
}
