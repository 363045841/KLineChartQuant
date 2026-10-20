/** 手绘与脚本共用的对象、坐标、样式和 Pine 风格 line API 契约。 */
export const LineStyle = {
  /** @summary 实线 */
  style_solid: 'solid',
  /** @summary 虚线 */
  style_dashed: 'dashed',
  /** @summary 点线 */
  style_dotted: 'dotted',
  /** @summary 左箭头 */
  style_arrow_left: 'arrow_left',
  /** @summary 右箭头 */
  style_arrow_right: 'arrow_right',
  /** @summary 双箭头 */
  style_arrow_both: 'arrow_both',
} as const
export type LineStyle = (typeof LineStyle)[keyof typeof LineStyle]
/** 延伸沿两锚点的参数方向，与屏幕左右方向无关。 */
export const extend = {
  /** @summary 不延伸 */
  none: 'none',
  /** @summary 延伸至起点之外 */
  left: 'left',
  /** @summary 延伸至终点之外 */
  right: 'right',
  /** @summary 两端延伸 */
  both: 'both',
} as const
export type LineExtend = (typeof extend)[keyof typeof extend]
/**
 * 决定 X 是第几根 K 线还是毫秒时间戳。
 *
 * bar_index 从当前已加载数据的第一根算起；左侧加载更多历史后，同一根 K 线的序号会变大。
 * 允许范围是 0 到当前 bar_index，再向右最多 500 根；越界直接报错。
 * 要让线段跨历史保持在固定的 K 线上，用 bar_time 传 time[offset]。
 */
export const xloc = {
  /** @summary 第几根 K 线 */
  bar_index: 'bar_index',
  /** @summary 毫秒时间戳 */
  bar_time: 'bar_time',
} as const
export type LineXLoc = (typeof xloc)[keyof typeof xloc]
export type DrawingStyle = {
  stroke?: string
  strokeWidth?: number
  strokeStyle?: LineStyle
  fill?: string
  fillOpacity?: number
  pointRadius?: number
  textColor?: string
  fontSize?: number
}
export type DrawingLabelPosition = 'start' | 'center' | 'end'
export type DrawingAnchorType = 'point' | 'horizontal' | 'vertical'
/** 时间锚点用于用户文档；logicalIndex 对应脚本当前运行的数据。 */
export type PersistedDrawingAnchor = {
  id: string
  type?: DrawingAnchorType
  time?: number | string
  futureOffset?: number
  logicalIndex?: number
  price: number
}
export type DrawingKind =
  | 'trend-line' | 'ray' | 'extended-line' | 'fib-retracement' | 'rectangle' | 'arrow'
  | 'horizontal-line' | 'horizontal-ray' | 'vertical-line' | 'cross-line' | 'info-line'
  | 'parallel-channel' | 'regression-channel' | 'flat-line' | 'disjoint-channel'
export type DrawingLabel = { text: string; position: DrawingLabelPosition }
export type DrawingLabelIndex = `${number}`
export type DrawingLabels = {
  line: Record<DrawingLabelIndex, DrawingLabel>
  area: Record<DrawingLabelIndex, DrawingLabel>
}
export type DrawingWorkspaceId = 'kline' | 'timeshare'
/** 唯一图形模型；ownerId 存在时归指标管理，不参与用户交互及历史。 */
export type DrawingObject<TParams = Record<string, unknown>> = {
  id: string
  kind: DrawingKind
  paneId: string
  workspaceId?: DrawingWorkspaceId
  ownerId?: string
  visible: boolean
  locked?: boolean
  zIndex?: number
  anchors: PersistedDrawingAnchor[]
  labels?: DrawingLabels
  params: TParams
  style: DrawingStyle
  /** line API 声明的绝对坐标单位；手绘的 bar 身份锚点由 anchors 自身表达。 */
  xloc?: LineXLoc
  extend?: LineExtend
}
/** 指标归属禁用全部交互；与用户的移动锁定分开。 */
export function isDrawingInteractive(drawing: DrawingObject): boolean {
  return drawing.ownerId === undefined
}
/** chart.point 值对象；绘制线段时复制坐标。 */
export interface ChartPoint {
  /** bar 索引；xloc.bar_index 时 line 读取该字段。 */
  readonly index?: number
  /** K 线时间戳（毫秒）；xloc.bar_time 时 line 读取该字段。 */
  readonly time?: number
  /** 价格。 */
  readonly price: number
}
/** 不暴露可修改对象本身的引用，只在所属运行内有效。 */
export interface LineRef {
  /** 对象标识；同一对象在 line.all 与创建结果中是同一个引用。 */
  readonly id: string
}
/** line.new 的重载：用 chart.point 端点或直接给出起止点的 X / Y 绘制线段。 */
export interface LineFactory {
  /**
   * 用两个 chart.point 端点绘制线段。
   * @summary 绘制线段
   *
   * | 参数 | 含义 |
   * | --- | --- |
   * | `first_point` | 起点；按 xloc 读取 index 或 time |
   * | `second_point` | 终点；规则同起点 |
   * | `xloc` | 决定 X 是第几根 K 线还是毫秒时间戳，默认第几根（xloc.bar_index） |
   * | `extend` | 延伸方向，默认 extend.none |
   * | `color` | CSS 颜色，默认 Color.Blue |
   * | `style` | 线型或箭头，默认 line.style_solid |
   * | `width` | 线宽，正整数逻辑像素，默认 1 |
   *
   * bar_index 从当前已加载数据的第一根算起，左侧加载更多历史后序号会变大；不在 0 到当前 bar_index + 500 之内会直接报错。要跨历史固定在某根 K 线上，用 xloc.bar_time 传 time[offset]。
   *
   * 返回线段引用；超过 max_lines_count 时最旧的线段被回收。
   */
  (first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef
  /**
   * 直接给出起止点的 X / Y 绘制线段。
   * @summary 绘制线段
   *
   * | 参数 | 含义 |
   * | --- | --- |
   * | `x1` | 起点 X；bar_index 时为索引，bar_time 时为毫秒时间戳 |
   * | `y1` | 起点价格 |
   * | `x2` | 终点 X；规则同 x1 |
   * | `y2` | 终点价格 |
   * | `xloc` | 决定 X 是第几根 K 线还是毫秒时间戳，默认第几根（xloc.bar_index） |
   * | `extend` | 延伸方向，默认 extend.none |
   * | `color` | CSS 颜色，默认 Color.Blue |
   * | `style` | 线型或箭头，默认 line.style_solid |
   * | `width` | 线宽，正整数逻辑像素，默认 1 |
   *
   * bar_index 从当前已加载数据的第一根算起，左侧加载更多历史后序号会变大；不在 0 到当前 bar_index + 500 之内会直接报错。要跨历史固定在某根 K 线上，用 xloc.bar_time 传 time[offset]。
   *
   * 返回线段引用。
   */
  (x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef
}
/**
 * 脚本和原生调用方共用的完整 line API。
 *
 * 线段跨 bar 保留，新建和修改只能在 onBar 内调用；引用只在本次运行内有效，
 * 重算后旧引用失效，需要继续操作时从 line.all 或新的结果重新获取。
 * 线段删除或回收后，set_* 不生效，get_* 返回 NaN 或 null。
 *
 * | 用法 | 含义 |
 * | --- | --- |
 * | `line.new(...)` | 绘制线段，超出 max_lines_count 时回收最旧 |
 * | `line.set_*` | 修改端点、颜色、线型、线宽或延伸 |
 * | `line.get_*` | 读取对应属性；已删除返回 NaN 或 null |
 * | `line.get_price(id, x)` | 按线段所在直线求价格，只支持 bar_index |
 * | `line.copy` / `line.delete` | 复制为新线段 / 删除线段 |
 */
export interface DrawingLineApi {
  /** @summary 实线 */
  readonly style_solid: LineStyle
  /** @summary 虚线 */
  readonly style_dashed: LineStyle
  /** @summary 点线 */
  readonly style_dotted: LineStyle
  /** @summary 左箭头 */
  readonly style_arrow_left: LineStyle
  /** @summary 右箭头 */
  readonly style_arrow_right: LineStyle
  /** @summary 双箭头 */
  readonly style_arrow_both: LineStyle
  /**
   * 绘制线段；两个重载分别接受 chart.point 端点与起止点的 X / Y。
   * @summary 绘制线段
   */
  readonly new: LineFactory
  /**
   * 本次运行绘制的全部线段引用，按创建顺序；与创建返回的引用相等，可直接比较。
   * @summary 全部线段
   */
  readonly all: readonly LineRef[]
  /**
   * 同时设置起点 X 和 Y；X 的取值方式沿用创建时的 xloc。
   * @summary 设置起点
   */
  set_xy1(id: LineRef, x: number, y: number): void
  /**
   * 同时设置终点 X 和 Y；X 的取值方式沿用创建时的 xloc。
   * @summary 设置终点
   */
  set_xy2(id: LineRef, x: number, y: number): void
  /**
   * 设置起点 X；取值方式沿用创建时的 xloc。
   * @summary 设置起点 X
   */
  set_x1(id: LineRef, x: number): void
  /**
   * 设置起点价格。
   * @summary 设置起点价格
   */
  set_y1(id: LineRef, y: number): void
  /**
   * 设置终点 X；取值方式沿用创建时的 xloc。
   * @summary 设置终点 X
   */
  set_x2(id: LineRef, x: number): void
  /**
   * 设置终点价格。
   * @summary 设置终点价格
   */
  set_y2(id: LineRef, y: number): void
  /**
   * 设置线段颜色，支持 CSS 颜色值。
   * @summary 设置颜色
   */
  set_color(id: LineRef, color: string): void
  /**
   * 设置线型，包括实线、虚线和箭头。
   * @summary 设置线型
   */
  set_style(id: LineRef, style: LineStyle): void
  /**
   * 设置线宽，正整数逻辑像素。
   * @summary 设置线宽
   */
  set_width(id: LineRef, width: number): void
  /**
   * 设置延伸方向；left 延伸至起点之外，right 延伸至终点之外。
   * @summary 设置延伸
   */
  set_extend(id: LineRef, extend: LineExtend): void
  /**
   * 读取起点 X；线段已删除返回 NaN。
   * @summary 起点 X
   */
  get_x1(id: LineRef): number
  /**
   * 读取起点价格；线段已删除返回 NaN。
   * @summary 起点价格
   */
  get_y1(id: LineRef): number
  /**
   * 读取终点 X；线段已删除返回 NaN。
   * @summary 终点 X
   */
  get_x2(id: LineRef): number
  /**
   * 读取终点价格；线段已删除返回 NaN。
   * @summary 终点价格
   */
  get_y2(id: LineRef): number
  /**
   * 读取颜色；线段已删除返回 null。
   * @summary 颜色
   */
  get_color(id: LineRef): string | null
  /**
   * 读取线型；线段已删除返回 null。
   * @summary 线型
   */
  get_style(id: LineRef): LineStyle | null
  /**
   * 读取线宽；线段已删除返回 NaN。
   * @summary 线宽
   */
  get_width(id: LineRef): number
  /**
   * 读取延伸方向；线段已删除返回 null。
   * @summary 延伸方向
   */
  get_extend(id: LineRef): LineExtend | null
  /**
   * 按线段所在直线求 x 处的价格，与 extend 无关；只支持 xloc.bar_index，垂直线或已删除返回 NaN。
   * @summary 求价格
   */
  get_price(id: LineRef, x: number): number
  /**
   * 复制为新线段并返回其引用，副本独立于原线段。
   * @summary 复制线段
   */
  copy(id: LineRef): LineRef | null
  /**
   * 删除线段；传入 null 或已删除对象无操作。
   * @summary 删除线段
   */
  delete(id: LineRef | null): void
}
/** 对象仓库端口；文档和 VM 使用相同 API，各自提供状态容器。 */
export interface DrawingObjectStore {
  list(): readonly DrawingObject[]
  /** 完整快照原子提交；用户文档和 VM 都不暴露零散的写入路径。 */
  replace(drawings: readonly DrawingObject[]): void
  nextId(): string
}
export interface DrawingLineContext {
  readonly paneId: string
  readonly ownerId?: string
  readonly defaultColor: string
  readonly maxLines: number
  /** 当前已执行的 K 线根数（bar_index + 1）；用于校验 bar_index 坐标的范围。 */
  readonly barCount: number
}
