/**
 * 插件系统核心类型定义
 */

import type { ChartDataView } from '../types/chartView.js'
import type { ChartSeriesDatum, KLineData } from '../types/price.js'
import type { ScaleType } from '../types/scaleType.js'

/** 插件生命周期状态 */
export enum PluginState {
  Registered = 'registered',
  Installed = 'installed',
  Error = 'error',
}

/** 插件配置 */
export interface PluginConfig {
  enabled?: boolean
  priority?: number
  [key: string]: unknown
}

/** 插件元信息 */
export interface PluginMeta {
  name: string
  version: string
  description?: string
  author?: string
}

/** 插件接口 */
export interface Plugin extends PluginMeta {
  /** 安装插件 */
  install(host: PluginHost, config?: Record<string, unknown>): void | Promise<void>
  /** 卸载插件 */
  uninstall?(): void | Promise<void>
}

/** 插件描述符（注册时使用） */
export interface PluginDescriptor {
  plugin: Plugin
  config?: PluginConfig
  state: PluginState
  error?: Error
}

/** Hook 函数类型 */
export type HookFn<T = unknown, R = unknown> = (context: T) => R | Promise<R>

/** Hook 调用选项 */
export interface HookCallOptions {
  throwOnError?: boolean
}

/** Hook 描述符 */
export interface HookDescriptor<T = unknown, R = unknown> {
  name: string
  fn: HookFn<T, R>
  priority: number
}

/** 事件处理器 */
export type EventHandler<T = unknown> = (data: T) => void

/** 插件日志器 */
export interface PluginLogger {
  info(message?: unknown, ...optionalParams: unknown[]): void
  warn(message?: unknown, ...optionalParams: unknown[]): void
  error(message?: unknown, ...optionalParams: unknown[]): void
}

/** 插件宿主接口（暴露给插件使用的 API） */
export interface PluginHost {
  /** 事件总线 */
  readonly events: {
    on<T = unknown>(event: string, handler: EventHandler<T>): void
    off<T = unknown>(event: string, handler: EventHandler<T>): void
    emit<T = unknown>(event: string, data: T): void
    once<T = unknown>(event: string, handler: EventHandler<T>): void
  }

  /** Hook 系统 */
  readonly hooks: {
    tap<T = unknown, R = unknown>(hookName: string, fn: HookFn<T, R>, priority?: number): void
    untap(hookName: string, fn: HookFn): void
    call<T = unknown, R = unknown>(
      hookName: string,
      context: T,
      options?: HookCallOptions,
    ): Promise<R[]>
    callSync<T = unknown, R = unknown>(hookName: string, context: T, options?: HookCallOptions): R[]
  }

  /** 获取配置 */
  getConfig<K = unknown>(pluginName: string, key: string, defaultValue?: K): K

  /** 设置配置 */
  setConfig(pluginName: string, key: string, value: unknown): void

  /** 获取其他插件 */
  getPlugin<T extends Plugin = Plugin>(name: string): T | undefined

  /** 日志工具 */
  log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void

  // ============ 状态存储 API ============

  /** 设置共享状态 */
  setSharedState<T extends BaseIndicatorState>(namespace: string, state: T, ownerId?: string): void

  /** 获取共享状态 */
  getSharedState<T extends BaseIndicatorState>(namespace: string): T | undefined

  /** 清除共享状态 */
  clearSharedState(namespace: string): void

  /** 注册状态拥有者 */
  registerStateOwner(ownerId: string, namespaces: string[]): void

  /** 按拥有者清除状态 */
  clearByOwner(ownerId: string): void

  /** 注册服务 */
  registerService(name: string, service: unknown): void

  /** 获取已注册的服务 */
  getService<T = unknown>(name: string): T | undefined
}

// ============ 渲染器插件类型 ============

/** Pane 角色 */
export type PaneRole = 'price' | 'indicator' | 'auxiliary'

/** Pane 能力开关 */
export interface PaneCapabilities {
  showPriceAxisTicks: boolean
  showCrosshairPriceLabel: boolean
  candleHitTest: boolean
  supportsPriceTranslate: boolean
}

/** Pane 信息接口 */
export interface PaneInfo {
  id: string
  role: PaneRole
  capabilities: PaneCapabilities
  top: number
  height: number
  yAxis: {
    priceToY(price: number): number
    yToPrice(y: number): number
    getPaddingTop(): number
    getPaddingBottom(): number
    getPriceOffset(): number
    getDisplayRange(baseRange?: { maxPrice: number; minPrice: number }): {
      maxPrice: number
      minPrice: number
    }
    getScaleType(): ScaleType
    getBasePrice(): number | null
    toPercent(price: number): number
    fromPercent(pct: number): number
    getDisplayPercentRange(): { minPct: number; maxPct: number }
  }
  priceRange: {
    maxPrice: number
    minPrice: number
  }
}

/**
 * 轴标签目标表面：决定绘制到哪块轴 canvas 以及在该 canvas 内的绘制相位。
 *
 * X 表面跨 Pane 共享（底部时间轴唯一）；Y 表面按 Pane 隔离。
 */
export type AxisLabelSurface =
  | 'xTicks' // 底部时间轴刻度文字
  | 'xCrosshair' // 底部时间轴十字线时间签
  | 'xLabels' // 底部时间轴图元装饰标签
  | 'yRightStatic' // 右 Y 轴静态 canvas 内容（主图刻度 / 副图指标刻度与十字线）
  | 'yRightOverlay' // 右 Y 轴 overlay canvas 内容（装饰标签、十字线价签）
  | 'yLeftStatic' // 左 Y 轴静态 canvas 内容（主图刻度）
  | 'yLeftOverlay' // 左 Y 轴 overlay canvas 内容（十字线价签）

/** 轴刻度文字标签：纯文本，无底色。 */
export interface AxisTickLabel {
  kind: 'tick'
  /** 已按所在轴显示语义格式化好的文本。 */
  text: string
  /** X 表面为屏幕 x（逻辑像素）；Y 表面为 pane 内 y。 */
  pos: number
  color: string
  fontSize?: number
  /** 年份等需要加粗的刻度。 */
  bold?: boolean
  /** Y 表面文本水平对齐；默认 center。 */
  align?: 'left' | 'center' | 'right'
}

/** 轴色块标签：底矩形 + 居中文字（价格签 / 时间签）。 */
export interface AxisTagLabel {
  kind: 'tag'
  /** 已格式化好的文本。 */
  text: string
  /** X 表面为屏幕 x（逻辑像素）；Y 表面为标签的 pane 内 y。 */
  pos: number
  /**
   * 锚点坐标的画布原点偏移（逻辑像素），用于复现各轴 renderer 既有的 clamp 原点
   * （价格签沿用 pane.top）；默认 0。
   */
  origin?: number
  /** 价格签基线微调：'label' 文本下移 1px，'crosshair' 物理像素中心对齐；默认 'label'。 */
  variant?: 'label' | 'crosshair'
  bgColor: string
  borderColor?: string
  textColor: string
  fontSize?: number
  /** X 时间签左右内边距，默认 8。 */
  paddingX?: number
}

/** 单条轴标签：生产者计算好的 ready-to-draw 数据，由轴标签模块统一布局绘制。 */
export type AxisLabel = AxisTickLabel | AxisTagLabel

/** 单表面轴标签收集器：生产者经 register 写入，渲染器直接消费 labels。 */
export interface AxisLabelCollector {
  /** 渲染器直接消费的可变标签缓冲区；“当前帧”语义由每帧重建保证。 */
  readonly labels: AxisLabel[]
  register(label: AxisLabel): void
  registerAll(labels: ReadonlyArray<AxisLabel>): void
}

/**
 * 帧级轴标签聚合：按表面取收集器。
 *
 * X 表面跨 Pane 共享；Y 表面按 paneId 隔离。每帧由渲染器新建，
 * 帧内累积、帧结束后随对象释放，不持有跨帧状态。
 */
export interface AxisLabelsFrame {
  /**
   * 取指定表面的收集器；X 表面忽略 paneId，同一 (surface, paneId) 稳定返回同一实例。
   *
   * @param surface - 目标轴表面
   * @param paneId - Y 表面的 Pane 隔离键；X 表面忽略
   */
  forSurface(surface: AxisLabelSurface, paneId?: string): AxisLabelCollector
}

/** Y轴范围带（半透明填充区域） */
export interface YAxisRange {
  /** 范围上界Y坐标（相对pane，canvas方向：小值=上方） */
  topY: number
  /** 范围下界Y坐标（相对pane，canvas方向：大值=下方） */
  bottomY: number
  /** 填充颜色（hex 或 rgba） */
  color: string
  /** 填充不透明度 */
  opacity: number
}

/** X轴范围带（半透明填充区域） */
export interface XAxisRange {
  /** 范围左界X坐标（世界坐标，未减去scrollLeft） */
  leftX: number
  /** 范围右界X坐标（世界坐标，未减去scrollLeft） */
  rightX: number
  /** 填充颜色（hex 或 rgba） */
  color: string
  /** 填充不透明度 */
  opacity: number
}

/**
 * 单个 Pane 内绘图在当前帧的纯投影结果。
 *
 * 轴标签不经返回值传递：投影时通过帧级 axisLabels 模块的注册入口注册到本帧表面，
 * 此处只保留范围带。
 */
export interface DrawingFrameProjection {
  primitives: ReadonlyArray<DrawingPrimitive>
  yAxisRanges: ReadonlyArray<YAxisRange>
  xAxisRanges: ReadonlyArray<XAxisRange>
}

/** Y轴刻度（位置+值），由 RenderContext 构建时预计算，所有 Y 轴渲染器共用 */
export interface YAxisTick {
  /** Y像素位置（相对 pane 顶部，逻辑像素） */
  y: number
  /** 该Y位置通过 pane.yAxis.yToPrice 反算的价格值 */
  value: number
}

/** 五日分时中单个交易日的帧级几何。 */
export interface FiveDayTimeShareDayGeometry {
  tradingDate: string
  dataStartIndex: number
  dataEndIndex: number
  startX: number
  endX: number
  labelX: number
  separatorX?: number
}

/** 五日分时共享几何，由帧准备阶段生成并供所有 renderer 消费。 */
export interface FiveDayTimeShareGeometry {
  sessionSlots: number
  contentWidth: number
  days: ReadonlyArray<FiveDayTimeShareDayGeometry>
  /** 首尾交易日边界和日间分隔线的世界坐标。 */
  verticalGridLineXs: ReadonlyArray<number>
}

/** MarkerManager 接口（用于 RenderContext） */
export interface MarkerManagerLike {
  getCustomMarkers(): unknown[]
  setCustomMarkerPosition(id: string, x: number, y: number, size: number, shape: string): void
}

/** 当前帧读取指标渲染投影的只读接口。 */
export interface IndicatorRenderStateReader {
  /** 按指标实例 ID 读取当前帧已提交的指标状态。 */
  get<T = unknown>(instanceId: string): T | undefined
}

/** 渲染数据子契约：序列数据、数据视图与时间解析。 */
export interface RenderDataContext {
  /** 当前帧的序列数据：K 线视图为 KLineData，分时视图为 TimeShareData。 */
  data: ReadonlyArray<ChartSeriesDatum>
  /** K线级别，如 'daily'、'5min'、'15min' */
  period: string
  /** 当前图表数据视图。 */
  dataView: ChartDataView
  /** 多日分时的原子业务快照。 */
  timeShareRange?: import('../../data/provider/types.js').TimeShareRange
  /** 五日分时的帧级共享几何。 */
  fiveDayTimeShareGeometry?: FiveDayTimeShareGeometry
  /** 当前图表实例解析后的市场交易时段 */
  marketSession?: import('../utils/sessionTimeLabels.js').MarketSessionConfig
  comparisonData?: ReadonlyMap<string, ReadonlyArray<KLineData>>
  comparisonSymbols?: ReadonlyArray<import('../../controllers/types.js').SymbolSpec>
  comparisonColors?: ReadonlyMap<string, string>
  /** 由活动数据 Buffer 提供的唯一时间戳到逻辑索引解析。 */
  getLogicalIndexAtTimestamp: (timestamp: number) => number | null
  /** 当前图表的显示时区 formatter；仅用于普通 K 线的日期显示与边界。 */
  displayTimeFormatter: import('../utils/dateFormat.js').DisplayTimeFormatter
}

/** 渲染几何子契约：Pane、视口、K 线位置与缩放。 */
export interface RenderGeometryContext {
  pane: PaneInfo
  range: { start: number; end: number }
  scrollLeft: number
  kWidth: number
  kGap: number
  dpr: number
  paneWidth: number
  kLinePositions: number[]
  /** 每根K线柱中心的X坐标（物理像素对齐后，逻辑像素） */
  kLineCenters: number[]
  /** 每根K线对应柱的X/宽度（物理像素对齐后，逻辑像素），供柱状图使用 */
  kBarRects: Array<{ x: number; width: number }>
  /** 本帧 K 线实体宽度（物理像素），由帧准备阶段统一计算。 */
  kWidthPx: number
  /** K 线真正可视区的 high/low 及其索引；由帧准备阶段计算，供多个 renderer 共享。 */
  visiblePriceExtrema?:
    | import('../../engine/utils/visiblePriceExtrema.js').VisiblePriceExtrema
    | null
  /** 本帧可视极值跨越右轴文字数量级边界，允许低频实测并调整宽度。 */
  requiresRightAxisWidthMeasurement?: boolean
  viewport: {
    scrollLeft: number
    plotWidth: number
    plotHeight: number
  }
  /** 当前缩放级别（1 ~ zoomLevels） */
  zoomLevel?: number
  /** 总缩放级别数 */
  zoomLevelCount?: number
}

/** 坐标轴子契约：本帧待绘制的轴标签、范围带与刻度。 */
export interface RenderAxisContext {
  /**
   * 帧级轴标签收集器。生产者经 `registerAxisLabel` 写入本帧表面；
   * 轴渲染器按表面读取并由轴标签模块统一绘制，不再直接操作标签数组。
   */
  axisLabels: AxisLabelsFrame
  /** 需要在Y轴上绘制的范围带列表（由绘图渲染器填充，先于标签绘制） */
  yAxisRanges: YAxisRange[]
  /** 需要在X轴上绘制的范围带列表（由绘图渲染器填充，先于标签绘制） */
  xAxisRanges: XAxisRange[]
  /** 预计算的 Y 轴刻度列表（统一像素均匀分布 → yToPrice 反算），所有 Y 轴渲染器共用 */
  yAxisTicks?: YAxisTick[]
}

/** 覆盖层子契约：十字线、标记器与绘图帧投影。 */
export interface RenderOverlayContext {
  /** 十字线指向的 K 线索引（无十字线时为 null） */
  crosshairIndex?: number | null
  markerManager?: MarkerManagerLike
  /** 绘图系统预先生成的当前 Pane 帧投影。 */
  drawingProjection?: DrawingFrameProjection
}

/** 指标子契约：指标帧快照与 GPU Scene 渲染器。 */
export interface RenderIndicatorContext {
  /** 当前帧绑定的指标渲染快照，所有指标 renderer 共用同一版本。 */
  indicatorStateReader?: IndicatorRenderStateReader
  /**
   * Scene 本帧 Renderer（createLayerFromPlugin 注入）。
   * 业务绘制经 drawInstances / drawLines；失败 fail-closed 走 2D。
   */
  sceneRenderer?: import('../../rendering/render/Renderer.js').Renderer
}

/** 绘制目标子契约：主图、轴与覆盖层 Canvas2D 上下文。 */
export interface RenderSurfaceContext {
  ctx: CanvasRenderingContext2D
  /** 覆盖层 Canvas 上下文（用于十字线、Tooltip 等动态内容） */
  overlayCtx?: CanvasRenderingContext2D
  yAxisCtx?: CanvasRenderingContext2D
  /** 轴区动态层（最新价标签、十字线价签） */
  yAxisOverlayCtx?: CanvasRenderingContext2D
  leftAxisCtx?: CanvasRenderingContext2D
  leftAxisOverlayCtx?: CanvasRenderingContext2D
  xAxisCtx?: CanvasRenderingContext2D
  borderCtx?: CanvasRenderingContext2D
}

/** 主题与设置子契约：渲染器只读。 */
export interface RenderThemeContext {
  /** 当前主题 */
  theme: 'light' | 'dark'
  /** 亚洲市场惯例（红涨绿跌）；为 true 时自动交换所有 bull/bear 颜色 */
  isAsiaMarket?: boolean
  /** 用户颜色预设覆盖项 */
  colorPresetSettings?: import('../tokens/index.js').ColorPresetSettings
  /** 用户设置配置（渲染器只读） */
  settings?: import('../config/chartSettings.js').ChartSettings
}

/**
 * 渲染上下文：由各职责子契约组合而成。
 * 渲染器只需其中部分能力时，参数应声明对应子契约而非本组合类型。
 */
export interface RenderContext
  extends RenderAxisContext,
    RenderDataContext,
    RenderGeometryContext,
    RenderIndicatorContext,
    RenderOverlayContext,
    RenderSurfaceContext,
    RenderThemeContext {}

/** 绘图渲染 primitive 契约：仅保留 `RenderContext`/`DrawingFrameProjection` 依赖的屏幕原语。 */

export type DrawingStyle = {
  stroke?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted'
  fill?: string
  fillOpacity?: number
  pointRadius?: number
  textColor?: string
  fontSize?: number
}

/** 绘图线段文字在线段语义方向上的位置。 */
export type DrawingLabelPosition = 'start' | 'center' | 'end'

export type ScreenPoint = { x: number; y: number }

/** 图元附属文字；位置由所属图元在渲染期计算。 */
export type PrimitiveTextAttachment = {
  text: string
  position?: DrawingLabelPosition
  align?: 'left' | 'center' | 'right'
  baseline?: 'top' | 'middle' | 'bottom'
}

/** 水平锚点的屏幕投影，只具有 Y 坐标。 */
export type ScreenHorizontalAnchor = { type: 'horizontal'; y: number }

/** 垂直锚点的屏幕投影，只具有 X 坐标。 */
export type ScreenVerticalAnchor = { type: 'vertical'; x: number }

/** 锚点的屏幕投影，按锚点语义保留缺失的坐标轴。 */
export type ScreenDrawingAnchor =
  | ({ type: 'point' } & ScreenPoint)
  | ScreenHorizontalAnchor
  | ScreenVerticalAnchor

/** 绘图图元种类。 */
export type DrawingPrimitiveKind = 'point' | 'line' | 'area' | 'text' | 'arrow'

/** 点图元角色：锚点、平移手柄。 */
export type PointRole = 'anchor' | 'translate-handle'

/** 点图元：锚点圆点统一填白底、描图元色环，没有填充色开关。 */
export type PointPrimitive = {
  kind: 'point'
  point: ScreenPoint
  role?: PointRole
  text?: PrimitiveTextAttachment
  style?: DrawingStyle
}

export type LinePrimitive = {
  kind: 'line'
  a: ScreenPoint
  b: ScreenPoint
  extend?: 'none' | 'left' | 'right' | 'both'
  showEndpoints?: boolean
  text?: PrimitiveTextAttachment
  style?: DrawingStyle
}

export type AreaPrimitive = {
  kind: 'area'
  points: ScreenPoint[]
  closed: boolean
  text?: PrimitiveTextAttachment
  style?: DrawingStyle
}

export type TextPrimitive = {
  kind: 'text'
  point: ScreenPoint
  text: string
  align?: 'left' | 'center' | 'right'
  baseline?: 'top' | 'middle' | 'bottom'
  style?: DrawingStyle
}

/** 箭头图元：由渲染器作为一个整体绘制轴线和实心箭头头部。 */
export type ArrowPrimitive = {
  kind: 'arrow'
  start: ScreenPoint
  end: ScreenPoint
  headLength?: number
  headAngle?: number
  text?: PrimitiveTextAttachment
  style?: DrawingStyle
}

export type DrawingPrimitive =
  | PointPrimitive
  | LinePrimitive
  | AreaPrimitive
  | TextPrimitive
  | ArrowPrimitive

/** 渲染器插件接口（独立定义，不继承 Plugin） */
export interface RendererPlugin {
  /** 唯一标识 */
  readonly name: string

  /** 版本号 */
  readonly version?: string

  /** 描述 */
  readonly description?: string

  /** 调试用显示名称 */
  readonly debugName?: string

  /** 渲染目标 pane（'main' | 'sub' | GLOBAL_PANE_ID 表示所有） */
  paneId: string | symbol

  /** 渲染优先级（数字越大越后渲染） */
  priority: number

  /** 是否启用（仅作为初始值，运行时状态由 Manager 管理） */
  enabled?: boolean

  /**
   * 是否为系统渲染器（时间轴等）。
   * 调度由 Scene Layer 负责；Manager 仅作注册表。
   */
  isSystem?: boolean

  /**
   * 渲染器所属层，供 Scene role 过滤
   * - 'main': 低频/静态内容
   * - 'overlay': 高频/动态内容
   * 未指定时默认为 'main'
   */
  layer?: 'main' | 'overlay'

  /** 渲染方法 */
  draw(context: RenderContext): void

  /** 容器尺寸变化时回调 */
  onResize?(pane: PaneInfo): void

  /** 获取配置 */
  getConfig?(): Record<string, unknown>

  /** 设置配置 */
  setConfig?(config: Record<string, unknown>): void

  /** 卸载时清理资源 */
  onUninstall?(): void
}

/** 带插件系统能力的渲染器（可选） */
export interface RendererPluginWithHost extends RendererPlugin {
  /** 安装时获取 PluginHost 访问权限 */
  onInstall?(host: PluginHost): void
  /** 声明该渲染器所拥有的状态命名空间，卸载时框架会自动清理 */
  getDeclaredNamespaces?(): string[]
}

// ============ 状态存储类型 ============

/** 指标渲染器状态基类 */
export interface BaseIndicatorState {
  timestamp: number
}
