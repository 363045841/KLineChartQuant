/**
 * Framework-agnostic controller interfaces.
 *
 * Every adapter (React, Vue, Angular) consumes these. Controllers expose state as
 * `ReadonlySignal<T>` so adapters bridge with their own reactivity (useSyncExternalStore,
 * shallowRef, toSignal).
 *
 * Mutation methods are imperative — adapters call them in event handlers.
 */

import type { Bar, IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import type {
  InstrumentCapabilities,
  InstrumentDescriptor,
  InstrumentType,
} from '../data/provider/types.js'
import type {
  IndicatorInstance,
  IndicatorRole,
  InteractionSnapshot,
  SubPaneInfo,
} from '../engine/chart/index.js'
import type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingLabelIndex,
  DrawingLabelPosition,
  DrawingStyle,
  DrawingStyleKey,
  DrawingTimeframeVisibility,
  DrawingToolId,
  PersistedDrawingAnchor,
  DrawingObject as PluginDrawingObject,
  UpdateDrawingPatch,
} from '../engine/drawing/index.js'
import type { IndicatorTemplateApi } from '../engine/indicatorTemplate/types.js'
import type { LayoutApi } from '../engine/layout/types.js'
import type {
  InstanceMoveOption,
  InstanceMoveTarget,
  PaneGeometry,
  PanePatch,
  PaneSpec,
} from '../engine/pane/types.js'
import { INDICATOR_ROLE } from '../engine/state/indicatorRole.js'
import type { IndicatorInstancePatch } from '../engine/state/indicatorState.js'
import type { ChartAgentController } from '../features/agent/types.js'
import type { AlertController } from '../features/alerts/types.js'
import type { ChartSettings } from '../foundation/config/chartSettings.js'
import type { Plugin, PluginConfig } from '../foundation/plugin/types.js'
import type { ReadonlySignal } from '../foundation/reactivity/index.js'
import type { ChartDataView } from '../foundation/types/chartView.js'
import type { ChartRendererAccess } from './renderers/index.js'

export {
  FIVE_DAY_TIME_SHARE_DAYS,
  FIVE_DAY_TIME_SHARE_PERIOD,
  isTimeSharePeriod,
  TIME_SHARE_PERIOD,
} from '../foundation/types/chartPeriod.js'

import type { MarketSessionConfig } from '../foundation/utils/sessionTimeLabels.js'

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

/** 指标实例与副图信息沿用引擎投影，避免控制器层重复定义。 */
export type { IndicatorInstance, IndicatorRole, SubPaneInfo }
/** 指标角色运行时取值由状态层定义；控制器层转出以保持适配器导入路径稳定。 */
export { INDICATOR_ROLE }

/** 组件受控指标实例配置。 */
export interface ChartIndicatorConfig {
  definitionId: string
  role: IndicatorRole
  enabled: boolean
  params?: Record<string, unknown>
}

export type DrawingObject = PluginDrawingObject
export type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingLabelIndex,
  DrawingLabelPosition,
  DrawingStyle,
  DrawingStyleKey,
  DrawingTimeframeVisibility,
  UpdateDrawingPatch,
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
  /** 分时成交量，单位手；上游未提供时缺失。 */
  volume?: number
  /** 分时成交额，单位元；上游未提供时缺失。 */
  amount?: number
}

export type { InstanceMoveOption, InstanceMoveTarget, PaneGeometry, PaneSpec }

// ---------------------------------------------------------------------------
export type DataSourceParams = Readonly<Record<string, string | number | boolean>>

/** Registered symbol metadata — for the symbol catalog/dropdown UI */
export interface SymbolInfo {
  /** 统一行情模型提供的稳定品种 ID；旧目录结果可暂时缺失。 */
  id?: string
  instrumentType?: InstrumentType
  sessionId?: string
  capabilities?: InstrumentCapabilities
  tickSize?: number
  lotSize?: number
  currency?: string
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
  visibleWhen?: { key: string; values: readonly (number | string | boolean)[] }
}

export interface IndicatorDefinition {
  source?: import('../engine/indicators/indicatorMetadata.js').IndicatorSource
  id: string
  label: string
  name?: string
  description?: string
  role: IndicatorPaneRole
  params: ReadonlyArray<IndicatorParamDef>
  /** 脚本身份：内置只读或用户可编辑；原生指标没有该字段。 */
  documentIdentity?: import('../engine/indicators/pipeline/types.js').IndicatorDocumentIdentity
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

export { createIdleInteractionSnapshot } from '../engine/state/interactionState.js'
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
// Drawing adapter ports — DrawingInteractionController 及其协作者的最小职责契约
// ---------------------------------------------------------------------------

export interface DrawingChartViewport {
  scrollLeft: number
  plotWidth: number
  plotHeight: number
}

/**
 * 图元文档操作：图元增删改查、批量操作、选择集合与工具状态。
 * 拖拽覆盖与预览等会话态不在本契约内。
 */
export interface DrawingDocumentPort {
  /** 外部权威文档同步：替换并重设撤回历史基线。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void
  /** read the full drawing list (plugin-level DrawingObject) */
  getFullDrawings(): ReadonlyArray<DrawingObject>
  /** 创建一个已确认图元。 */
  createDrawing(input: CreateDrawingInput): DrawingObject
  /** 以显式锚点复制存在的图元；不取消当前会话，供交互层使用。 */
  duplicateDrawings(
    placements: ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }>,
  ): ReadonlyArray<DrawingObject>
  /** 以完整模型快照更新一个已确认图元。 */
  updateDrawing(drawing: DrawingObject): DrawingObject | null
  /** 提交交互层拖拽后的已解析锚点。 */
  commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): DrawingObject | null
  /** 原子提交一组交互层拖拽后的已解析锚点。 */
  commitDrawingDrags(
    updates: ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }>,
  ): ReadonlyArray<DrawingObject>
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
  setDrawingToolId(toolId: import('../engine/drawing/index.js').DrawingToolId): void
  /** read current drawing tool id from kernel */
  getDrawingToolId(): import('../engine/drawing/index.js').DrawingToolId
  /** 读取全局绘图锁定：全局锁只冻结移动，不阻止删除。 */
  isGlobalDrawingLocked(): boolean
}

/**
 * 视口与坐标换算查询：K 线数据在逻辑索引 / 时间戳 / 屏幕像素 / 价格之间解析。
 * 只读，不修改图元或会话态。
 */
export interface DrawingViewportPort {
  /** 当前 Pane 的公开双向坐标服务；帧尚未就绪时返回 null。 */
  getCoordinates(
    paneId: string,
  ): import('../foundation/geometry/frameCoordinates.js').FrameCoordinates | null
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
  getXAtLogicalIndex(index: number): number | null
  /** 逻辑索引对应当前绘制数据点的时间戳（ms）。 */
  getDrawingTimestampAtLogicalIndex(index: number): number | null
  /** unix timestamp (ms) → current logical index */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
  /** 当前绘图所属的数据工作区。 */
  getDrawingWorkspaceId(): import('../engine/drawing/index.js').DrawingWorkspaceId
  /** 当前绘图所属的标的身份；无主品种时 undefined。 */
  getDrawingSymbolKey(): string | undefined
  /** 当前绘图所属的数据周期；周期可见性过滤使用。 */
  getDrawingPeriod(): string
  /** price → Y within the given pane */
  priceToY(paneId: string, price: number): number
  /** Y within the given pane → price */
  yToPrice(paneId: string, y: number): number
  /** read-only pane metadata by pane ID */
  getPaneInfo(paneId: string): PaneLayoutInfo | undefined
  /** 根据图表局部 Y 坐标查找所属 Pane。 */
  getPaneAtY(y: number): PaneLayoutInfo | undefined
  /** 当前 Pane 已提交层的图元线段（Pane 局部坐标），供磁吸候选。 */
  getSnapLines(paneId: string): ReadonlyArray<import('../engine/drawing/index.js').SnapLine>
  /** 指定逻辑下标处该 Pane 的指标值，供磁吸候选。 */
  getIndicatorValues(
    paneId: string,
    barIndex: number,
  ): ReadonlyArray<import('../engine/drawing/index.js').SnapIndicatorValue>
}

/**
 * 会话态通知：预览 / 拖拽中间态只改会话层时请求重绘，不写 kernel。
 * 拖拽冻结钩子与重绘共用这里，因为二者都属于「会话层怎么对外表现」，
 * 新增一个只服务绘图拖拽的 port 会让协作方多背一份依赖。
 */
export interface DrawingSessionPort {
  requestDraw?(): void
  /** 图元拖拽开始：冻结绘图悬停目标，拖拽期间光标不再被实时命中改写。 */
  freezeHoverTarget?(): void
  /** 图元拖拽结束：解冻绘图悬停目标，恢复实时命中。 */
  unfreezeHoverTarget?(): void
}

/**
 * 绘图适配器组合契约：ChartController 实现全部三个 port。
 * 协作者应依赖各自的最小 port，不要依赖本组合类型。
 */
export type DrawingChartAdapter = DrawingDocumentPort & DrawingViewportPort & DrawingSessionPort

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
  /** 宿主持有的行情管理实例；多个图表可以显式共享。 */
  marketDataContext?: import('../data/management/impl/context.js').MarketDataContext
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

  // Initial chart settings (overrides > stored preferences > DEFAULT_SETTINGS)
  settings?: Partial<ChartSettings>

  /**
   * 挂载时是否恢复布局归档里的活动布局。
   *
   * - `true`（默认）：沿用布局功能，恢复上次保存的配置。
   * - `false`：归档只作为手动保存/切换的仓库，图表从初始状态起步；
   *   宿主自行管理图表快照时可关闭；多标签应通过 layoutStorageId 隔离归档。
   */
  layoutRestore?: boolean
  /** 布局归档的稳定持有者身份；多标签使用标签 ID，省略时使用默认共享归档。 */
  layoutStorageId?: string

  /**
   * 指标实现的加载策略。
   * - `'on-demand'`（默认）：创建时只加载系统定义与已保存布局用到的指标，其余指标在
   *   `loadIndicators` / 布局切换 / Agent 工具时按需加载；同步的 `addIndicator` 等方法
   *   只接受已加载的定义。
   * - `'all'`：创建时加载全部内置指标，适合直接同步调用指标方法的宿主。
   */
  indicatorLoading?: IndicatorLoadingMode
}

/** 指标实现的加载策略，见 {@link ChartMountOptions.indicatorLoading}。 */
export type IndicatorLoadingMode = 'on-demand' | 'all'

/**
 * 图表控制器。
 *
 * @remarks
 * 布局（`LayoutApi`）与指标模板（`IndicatorTemplateApi`）刻意分开继承：
 * 布局是整张图表的快照，模板只含指标组合，两者存储与生命周期互不影响。
 */
export interface ChartController
  extends DrawingChartAdapter,
    ChartRendererAccess,
    LayoutApi,
    IndicatorTemplateApi {
  /** 一次临时指标计算，共享当前行情与 Request 上下文，完成后释放行情使用权。 */
  withIndicatorData<T>(
    compute: (bars: readonly Bar[], market: IndicatorMarketContext) => Promise<T>,
  ): Promise<T>
  /** 在完整绘制帧结束时同步调用捕获函数，返回其异步合成结果。 */
  captureFrame<T>(
    capture: (frame: import('./screenshot/types.js').ChartFrameCaptureContext) => T | Promise<T>,
  ): Promise<T>
  /** 使用现有 PluginHost 安装插件；插件可通过 getChartRenderers 获取渲染能力。 */
  usePlugin(plugin: Plugin, config?: PluginConfig): Promise<void>
  /** 卸载插件；其 uninstall 负责移除自有 Layer 和取消订阅。 */
  removePlugin(name: string): Promise<void>
  /** 按当前视口偏移复制所选图元，一次撤回移除全部副本。 */
  copyDrawings(ids: ReadonlyArray<string>): ReadonlyArray<DrawingObject>
  /** 将所选图元写入内部剪贴板；不创建副本、不写历史。 */
  copyDrawingsToClipboard(ids: ReadonlyArray<string>): boolean
  /** 从内部剪贴板粘贴，一次撤回移除全部副本。 */
  pasteDrawings(): ReadonlyArray<DrawingObject>
  /** 内部剪贴板是否非空。 */
  readonly hasDrawingClipboard: ReadonlySignal<boolean>
  /** Stable, serializable Agent context and deterministic query facade. */
  readonly agent: ChartAgentController
  // ---- Signals ----
  readonly viewport: ReadonlySignal<ChartViewport>
  /** 绘制完成后发布的帧几何；覆盖物必须使用它的投影，不能拼接实时状态。 */
  readonly frameGeometry: ReadonlySignal<
    import('../engine/frame/types.js').ChartFrameGeometry | null
  >
  /** 右轴当前有效 CSS 宽度（包含用户配置的最小宽度）。 */
  readonly rightAxisEffectiveWidth: ReadonlySignal<number>
  readonly leftAxisEffectiveWidth: ReadonlySignal<number>
  readonly data: ReadonlySignal<ReadonlyArray<KLineData>>
  readonly dataLoading: ReadonlySignal<boolean>
  /** 主品种最近一次显式拉取失败原因；成功或重置后为 null */
  readonly dataError: ReadonlySignal<string | null>
  /** 图表实例缓存的近似内存使用量与配置上限。 */
  readonly marketDataCacheStats: ReadonlySignal<
    import('../data/buffer/impl/marketDataCache.js').MarketDataCacheStats
  >
  readonly symbols: ReadonlySignal<ReadonlyArray<SymbolSpec>>
  readonly theme: ReadonlySignal<'light' | 'dark'>
  /** 用户偏好 settings（kernel.settings resolved 快照） */
  readonly settings: ReadonlySignal<
    Readonly<import('../foundation/config/chartSettings.js').ChartSettings>
  >
  /** 当前有效 renderer、切换状态和最近错误。 */
  readonly rendererRuntime: ReadonlySignal<
    Readonly<import('../rendering/render/rendererHost.js').RendererBackendRuntime>
  >
  /** 图表模式 id：kline | timeshare | fiveDayTimeShare | comparison */
  readonly chartMode: ReadonlySignal<ChartDataView>
  /** 最近一次 K 线周期；分时返回操作使用该值。 */
  readonly lastBarPeriod: ReadonlySignal<string>
  /** 当前就绪品种是否支持原始逐笔成交；足迹显示模式据此置灰入口。 */
  readonly footprintSupported: ReadonlySignal<boolean>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  /** 当前布局的指标收藏唯一数据源。 */
  readonly favoriteIndicatorIds: ReadonlySignal<ReadonlyArray<string>>
  /** 收藏操作不启用指标，也不加载其实现。 */
  setIndicatorFavorite(indicatorId: string, favorite: boolean): void
  readonly subPanes: ReadonlySignal<ReadonlyArray<SubPaneInfo>>
  /** 当前绘图工具（DrawingToolId，默认 cursor） */
  readonly drawingTool: ReadonlySignal<import('../engine/drawing/index.js').DrawingToolId>
  readonly drawings: ReadonlySignal<ReadonlyArray<DrawingObject>>
  readonly canUndoDrawing: ReadonlySignal<boolean>
  readonly canRedoDrawing: ReadonlySignal<boolean>
  /** 当前选中绘图 id 集合（kernel.drawing SSOT） */
  readonly selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>>
  /** 全局绘图锁定信号：为 true 时冻结全部图元的几何移动。 */
  readonly globalDrawingLock: ReadonlySignal<boolean>
  readonly paneRatios: ReadonlySignal<Readonly<Record<string, number>>>
  readonly paneLayout: ReadonlySignal<ReadonlyArray<PaneSpec>>
  /** Core 已提交的可见 Pane 像素布局，不进入用户配置。 */
  readonly paneGeometry: ReadonlySignal<ReadonlyArray<PaneGeometry>>
  /** 每个 Pane 的有效刻度和独立范围状态。 */
  readonly paneScaleTypes: ReadonlySignal<
    ReadonlyMap<string, import('../foundation/types/scaleType.js').ScaleType>
  >
  readonly panePriceAxisRanges: ReadonlySignal<
    Readonly<Record<string, import('../engine/state/mainPriceAxisState.js').PanePriceAxisRange>>
  >
  /** 设置目标 Pane 的轴状态；百分比仅支持主图。 */
  setPanePriceAxisScaleType(
    paneId: string,
    type: import('../foundation/types/scaleType.js').ScaleType,
  ): void
  setPanePriceAxisRangeMode(
    paneId: string,
    mode: import('../foundation/config/priceAxisRangeMode.js').PriceAxisRangeMode,
  ): void
  /** 重置目标 Pane 的范围变换，保留自动/手动模式。 */
  resetPanePriceAxis(paneId: string): void
  readonly interactionState: ReadonlySignal<InteractionSnapshot>
  /** 在当前十字线所在的 K 线上锁定垂直光标；索引无效时返回 false。 */
  lockCrosshairAt(index: number): boolean
  /** 解除垂直光标锁定。 */
  unlockCrosshair(): void
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
  readonly legend: import('../engine/legend/types.js').LegendApi
  /** 对象树：按 pane 分组的渲染对象视图与按身份寻址的命令面。 */
  readonly objects: import('../engine/objects/index.js').ObjectTree
  readonly comparisonColors: ReadonlySignal<ReadonlyMap<string, string>>
  readonly comparisonLoading: ReadonlySignal<boolean>
  /** 当前对比品种集合（唯一业务状态）。 */
  readonly comparisonSpecs: ReadonlySignal<ReadonlyArray<SymbolSpec>>

  /** Registered symbol catalog — adapters use for picker UI */
  readonly symbolCatalog: ReadonlySignal<ReadonlyArray<SymbolInfo>>

  // indicator catalog（注册表投影，随注册表变更自动重建）
  readonly catalog: ReadonlySignal<ReadonlyArray<IndicatorDefinition>>

  // ---- Alerts ----
  readonly alertController: AlertController

  // ---- Data ----
  /** 设置 kline 主品种/周期；对比集合独立，由 setComparisonSpecs 管理。 */
  setSymbols(next: ReadonlyArray<SymbolSpec>): void
  /** Register symbols into the available symbol catalog for UI pickers */
  registerSymbols(symbols: ReadonlyArray<SymbolInfo>): void
  /** 设置 K 线主图的原生比较折线集合，不改变 chartMode 或主品种。 */
  setComparisonSpecs(next: ReadonlyArray<SymbolSpec>): void
  addComparisonSymbol(spec: SymbolSpec, primary?: SymbolSpec | null): void
  removeComparisonSymbol(symbol: string): void
  /** 隐藏或显示比较折线，保留品种选择及图例。 */
  setComparisonHidden(identity: string, hidden: boolean): void
  /** Update the main symbol code without triggering a fetch */
  setCurrentSymbol(symbol: string): void
  /** Update the K-line period without triggering a fetch */
  setCurrentPeriod(period: string): void
  /** Switch to time-share view for a specific date (YYYYMMDD), e.g. after double-clicking a daily bar */
  switchToTimeShareForDate(dateYYYYMMDD: number): void
  /** 清除当前图表实例的行情缓存。 */
  clearMarketDataCache(): void
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
  /**
   * 按需加载指标实现（名称、展示名或别名）；已加载与未知 ID 直接跳过。
   * 同步指标方法只接受已加载的定义，调用前先 await 本方法。
   */
  loadIndicators(definitionIds: ReadonlyArray<string>): Promise<void>
  /** 创建实例；返回实例身份，主副图语义一致。 */
  addIndicator(
    definitionId: string,
    params?: Record<string, unknown>,
    target?: InstanceMoveTarget,
  ): string | null
  /** 迁移实例归属；源副图变空时自动回收。 */
  moveIndicator(instanceId: string, target: InstanceMoveTarget): boolean
  /** 删除实例；空副图一并回收。 */
  removeIndicator(instanceId: string): boolean
  /** 一次删除指定定义的全部实例，保留同 pane 中其它指标。 */
  removeIndicatorsByDefinition(definitionId: string): void
  /** 删除当前工作区全部指标实例；副图一并回收。 */
  clearAllIndicators(): void
  /** 更新实例参数、显隐、排序或定义。 */
  updateIndicator(instanceId: string, patch: IndicatorInstancePatch): boolean

  // ---- Drawing ----
  /**
   * 设置绘图工具；null 视为 cursor。
   */
  setDrawingTool(tool: DrawingToolId | null): void
  setDrawingToolId(toolId: import('../engine/drawing/index.js').DrawingToolId): void
  getDrawingToolId(): import('../engine/drawing/index.js').DrawingToolId
  /** 设置全局绘图锁定；只冻结移动，不改写各图元自身 locked。 */
  setGlobalDrawingLock(locked: boolean): void
  /** 注册绘图交互会话到 Chart，使工具切换能清会话副作用 */
  registerDrawingSession(session: unknown | null): void
  clearDrawings(): void
  createDrawing(input: CreateDrawingInput): DrawingObject
  updateDrawing(drawing: DrawingObject): DrawingObject | null
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject>
  getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey>
  removeDrawing(drawingId: string): boolean
  removeBatch(ids: ReadonlyArray<string>): boolean
  /** 外部权威文档同步：替换并重设撤回历史基线。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void
  /** 用户导入，作为一条可撤回的文档替换事务。 */
  importDrawings(drawings: ReadonlyArray<DrawingObject>): void
  undoDrawing(): boolean
  redoDrawing(): boolean

  // ---- Pane ----
  updatePane(paneId: string, patch: PanePatch): boolean
  removePane(paneId: string): boolean
  movePane(paneId: string, targetIndex: number): boolean
  reorderPanes(paneIds: ReadonlyArray<string>): boolean
  clearPanes(): void

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
  /** 按 K 线根数水平平移视口；正数向右、负数向左。 */
  scrollByBars(bars: number): void
  /** 重置视图：恢复初始缩放级别并复位主图价格轴。 */
  resetChart(): void

  // ---- Settings ----
  updateSettingsFacade(settings: Record<string, unknown>): void
  /** 按当前可见 range 的 Max/Min 适配主图纵轴，保留轴类型与范围模式。 */
  resetMainPriceAxis(): void
  updateOptionsFacade(options: Record<string, unknown>): void

  /** tear down DOM + listeners; idempotent */
  /** 立即关闭公开操作并清理挂载 DOM，返回插件卸载与资源释放的完成任务。 */
  dispose(): Promise<void>
}

/**
 * Factory contract — adapters call this on mount.
 *
 * Implementation lives in controllers/chart/impl/createChartController.ts and wires
 * the Chart engine behind this framework-agnostic contract.
 */
export type ChartControllerFactory = (
  opts: ChartMountOptions,
) => ChartController | Promise<ChartController>

// ---------------------------------------------------------------------------
// 旧类型入口：小型控制器的契约现由各自的语义模块维护。
// ---------------------------------------------------------------------------

export type { DrawingController, DrawingState } from './drawing/types.js'
export type { ToolbarController, ToolDefinition, ToolId } from './toolbar/types.js'
