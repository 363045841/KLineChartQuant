/**
 * 插件系统核心类型定义
 */

import type { KLineData } from '../types/price'
import type { CandleWebGLSurface, LineWebGLSurface } from '../engine/renderers/webgl/candleSurface'

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
    tap<T = unknown, R = unknown>(
      hookName: string,
      fn: HookFn<T, R>,
      priority?: number
    ): void
    untap(hookName: string, fn: HookFn): void
    call<T = unknown, R = unknown>(hookName: string, context: T, options?: HookCallOptions): Promise<R[]>
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
    getDisplayRange(baseRange?: { maxPrice: number; minPrice: number }): { maxPrice: number; minPrice: number }
    getScaleType(): 'linear' | 'log' | 'percent'
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
 * 创建 PaneInfo 的只读包装
 *
 * 设计决策：
 * - 使用 Readonly<T> 类型标注而非 Object.freeze，避免热路径上的运行时开销
 * - yAxis 方法通过闭包包装，隔离原始函数引用
 * - 依赖团队代码规范约束插件行为，而非运行时强制
 */
export function wrapPaneInfo(pane: {
  id: string
  role: PaneRole
  capabilities: PaneCapabilities
  top: number
  height: number
  yAxis: PaneInfo['yAxis']
  priceRange: PaneInfo['priceRange']
}): Readonly<PaneInfo> {
  return {
    id: pane.id,
    role: pane.role,
    capabilities: { ...pane.capabilities },
    top: pane.top,
    height: pane.height,
    yAxis: {
      priceToY: (price) => pane.yAxis.priceToY(price),
      yToPrice: (y) => pane.yAxis.yToPrice(y),
      getPaddingTop: () => pane.yAxis.getPaddingTop(),
      getPaddingBottom: () => pane.yAxis.getPaddingBottom(),
      getPriceOffset: () => pane.yAxis.getPriceOffset(),
      getDisplayRange: (baseRange) => pane.yAxis.getDisplayRange(baseRange),
      getScaleType: () => pane.yAxis.getScaleType(),
      getBasePrice: () => pane.yAxis.getBasePrice(),
      toPercent: (price) => pane.yAxis.toPercent(price),
      fromPercent: (pct) => pane.yAxis.fromPercent(pct),
      getDisplayPercentRange: () => pane.yAxis.getDisplayPercentRange(),
    },
    priceRange: pane.priceRange,
  }
}

/** Y轴标签（价格标签） */
export interface YAxisLabel {
  /** 关联的数据索引 */
  dataIndex: number
  /** 价格值 */
  price: number
  /** 标签在轴上的Y坐标（世界坐标，相对pane） */
  y: number
  /** 标签类型，用于区分不同渲染外观 */
  type?: 'lastPrice' | 'extrema' | 'anchor' | string
  /** 标签样式覆盖 */
  style?: {
    bgColor?: string
    borderColor?: string
    textColor?: string
  }
}

/** X轴标签（时间标签） */
export interface XAxisLabel {
  /** 关联的数据索引 */
  dataIndex: number
  /** 时间戳（毫秒） */
  timestamp: number
  /** 标签在轴上的X坐标（世界坐标，未减去scrollLeft） */
  x: number
  /** 标签样式覆盖 */
  style?: {
    bgColor?: string
    textColor?: string
  }
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

/** Y轴刻度（位置+值），由 RenderContext 构建时预计算，所有 Y 轴渲染器共用 */
export interface YAxisTick {
  /** Y像素位置（相对 pane 顶部，逻辑像素） */
  y: number
  /** 该Y位置通过 pane.yAxis.yToPrice 反算的价格值 */
  value: number
}

/** 渲染上下文 */
/** MarkerManager 接口（用于 RenderContext） */
export interface MarkerManagerLike {
  getCustomMarkers(): unknown[]
  setCustomMarkerPosition(id: string, x: number, y: number, size: number, shape: string): void
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  pane: PaneInfo
  data: unknown[]
  /** K线级别，如 'daily'、'5min'、'15min' */
  period: string
  comparisonData?: ReadonlyMap<string, ReadonlyArray<KLineData>>
  comparisonSymbols?: ReadonlyArray<import('../controllers/types').SymbolSpec>
  comparisonColors?: ReadonlyMap<string, string>
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
  markerManager?: MarkerManagerLike
  /** 十字线指向的 K 线索引（无十字线时为 null） */
  crosshairIndex?: number | null
  // 可选的其他 Canvas 上下文
  yAxisCtx?: CanvasRenderingContext2D
  leftAxisCtx?: CanvasRenderingContext2D
  xAxisCtx?: CanvasRenderingContext2D
  borderCtx?: CanvasRenderingContext2D
  /** 覆盖层 Canvas 上下文（用于十字线、Tooltip 等动态内容） */
  overlayCtx?: CanvasRenderingContext2D
  /** price pane 可选的 WebGL candle surface */
  candleWebGLSurface?: CandleWebGLSurface
  /** line indicator 可选的 WebGL line surface */
  lineWebGLSurface?: LineWebGLSurface
  /** 当前缩放级别（1 ~ zoomLevels） */
  zoomLevel?: number
  /** 总缩放级别数 */
  zoomLevelCount?: number
  viewport?: {
    scrollLeft: number
    plotWidth: number
    plotHeight: number
  }
  /** 用户设置配置（渲染器只读） */
  settings?: import('../config/chartSettings').ChartSettings
  /** 需要在Y轴上绘制的标签列表（由各类标记渲染器填充） */
  yAxisLabels?: YAxisLabel[]
  /** 需要在X轴上绘制的标签列表（由各类标记渲染器填充） */
  xAxisLabels?: XAxisLabel[]
  /** 需要在Y轴上绘制的范围带列表（由绘图渲染器填充，先于标签绘制） */
  yAxisRanges?: YAxisRange[]
  /** 需要在X轴上绘制的范围带列表（由绘图渲染器填充，先于标签绘制） */
  xAxisRanges?: XAxisRange[]
  /** 当前主题 */
  theme: 'light' | 'dark'
  /** 亚洲市场惯例（红涨绿跌）；为 true 时自动交换所有 bull/bear 颜色 */
  isAsiaMarket?: boolean
  /** 用户颜色预设覆盖项 */
  colorPresetSettings?: import('../tokens').ColorPresetSettings
  /** 预计算的 Y 轴刻度列表（统一像素均匀分布 → yToPrice 反算），所有 Y 轴渲染器共用 */
  yAxisTicks?: YAxisTick[]
  /** 预计算的月份键值数组（year*12+month），与 data 长度一致，由 DataBuffer 在数据加载时计算 */
  monthKeys?: Int32Array
  /** 预计算的日期键值数组（year*366+dayOfYear），与 data 长度一致，由 DataBuffer 在数据加载时计算 */
  dayKeys?: Int32Array
}

export type DrawingAnchor = {
  id: string
  index: number
  time?: number | string
  price: number
}

export type DrawingKind =
  | 'trend-line'
  | 'ray'
  | 'extended-line'
  | 'horizontal-line'
  | 'horizontal-ray'
  | 'vertical-line'
  | 'cross-line'
  | 'info-line'
  | 'parallel-channel'
  | 'regression-channel'
  | 'flat-line'
  | 'disjoint-channel'

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

export type DrawingObject<TParams = Record<string, unknown>> = {
  id: string
  kind: DrawingKind
  paneId: string
  visible: boolean
  locked?: boolean
  zIndex?: number
  anchors: DrawingAnchor[]
  params: TParams
  style: DrawingStyle
}

export type ScreenPoint = { x: number; y: number }

export type PointPrimitive = {
  kind: 'point'
  point: ScreenPoint
  role?: 'anchor' | 'handle' | 'marker' | 'center'
  style?: DrawingStyle
}

export type LinePrimitive = {
  kind: 'line'
  a: ScreenPoint
  b: ScreenPoint
  extend?: 'none' | 'left' | 'right' | 'both'
  showEndpoints?: boolean
  style?: DrawingStyle
}

export type AreaPrimitive = {
  kind: 'area'
  points: ScreenPoint[]
  closed: boolean
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

export type DrawingPrimitive = PointPrimitive | LinePrimitive | AreaPrimitive | TextPrimitive

export type DrawingGeometry = {
  primitives: DrawingPrimitive[]
  bounds?: { left: number; top: number; right: number; bottom: number }
  meta?: Record<string, unknown>
  computedAnchors?: DrawingAnchor[]
}

export type DrawingComputeContext = {
  pane: PaneInfo
  visibleData: KLineData[]
  seriesData: KLineData[]
  range: { start: number; end: number }
  kLinePositions: number[]
  kLineCenters: number[]
  kBarRects: Array<{ x: number; width: number }>
  kWidth: number
  kGap: number
  dpr: number
  paneWidth: number
  viewport: {
    scrollLeft: number
    plotWidth: number
    plotHeight: number
  }
  toScreen(anchor: DrawingAnchor): ScreenPoint
}

export interface DrawingDefinition<TParams = Record<string, unknown>> {
  kind: DrawingKind
  minAnchors: number
  maxAnchors: number
  compute(drawing: DrawingObject<TParams>, context: DrawingComputeContext): DrawingGeometry
}

/** 全局 Pane ID（渲染到所有 pane） */
export const GLOBAL_PANE_ID = Symbol('global-pane')

/** 优先级推荐范围 */
export const RENDERER_PRIORITY = {
  LAST_PRICE_LABEL: -25, // 最新价格 label 注册（必须在 SYSTEM_YAXIS 之前）
  SYSTEM_YAXIS: -20, // Y轴（系统级）
  SYSTEM_XAXIS: -20, // X轴（系统级）
  BACKGROUND: 0, // 背景层
  GRID: 10, // 网格线
  /**
   * 指标渲染器（MACD, RSI 等）
   * 所有指标渲染器必须使用此优先级或 ≤30 的值
   */
  INDICATOR: 30,
  MAIN: 50, // 主图（K线）
  /**
   * 指标刻度渲染器（依赖于前方指标写入的共享状态）
   * 必须晚于 INDICATOR 和 MAIN，确保每次绘制时先更新指标状态再绘制刻度。
   */
  INDICATOR_SCALE: 55,
  OVERLAY: 80, // 叠加层（标记点）
  FOREGROUND: 100, // 前景层（价格线）
  SYSTEM_BORDER: 120, // 边框（系统级）
  SYSTEM_CROSSHAIR: 150, // 十字线（系统级）
} as const

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
   * 是否为系统渲染器
   * 系统渲染器不会通过 getRenderers() 返回，只能通过 renderPlugin() 单独渲染
   * 用于时间轴、全局边框等需要单独控制渲染时机的场景
   */
  isSystem?: boolean

  /**
   * 渲染器所属层，决定 UpdateLevel 过滤行为
   * - 'main': 低频/静态内容，随主画布一起渲染
   * - 'overlay': 高频/动态内容，可在 overlay-only 更新时独立重绘
   * 未指定时默认为 'main'（向后兼容）
   */
  layer?: 'main' | 'overlay'

  /** 渲染方法 */
  draw(context: RenderContext): void

  /** 数据更新时回调 */
  onDataUpdate?(data: unknown[], range: { start: number; end: number }): void

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
