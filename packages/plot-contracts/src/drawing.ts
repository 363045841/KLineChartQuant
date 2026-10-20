/** 手绘与脚本共用的对象、坐标、样式和 Pine 风格 line API 契约。 */
export const LineStyle = {
  style_solid: 'solid', style_dashed: 'dashed', style_dotted: 'dotted',
  style_arrow_left: 'arrow_left', style_arrow_right: 'arrow_right', style_arrow_both: 'arrow_both',
} as const
export type LineStyle = (typeof LineStyle)[keyof typeof LineStyle]
/** 延伸沿两锚点的参数方向，与屏幕左右方向无关。 */
export const extend = { none: 'none', left: 'left', right: 'right', both: 'both' } as const
export type LineExtend = (typeof extend)[keyof typeof extend]
/** bar_time 使用毫秒时间戳。 */
export const xloc = { bar_index: 'bar_index', bar_time: 'bar_time' } as const
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
/** chart.point 值对象；创建线时复制坐标。 */
export interface ChartPoint { readonly index?: number; readonly time?: number; readonly price: number }
/** 不暴露可修改对象本身的引用，只在所属运行内有效。 */
export interface LineRef { readonly id: string }
export interface LineFactory {
  (first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef
  (x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef
}
/** 脚本和原生调用方共用的完整 line API。 */
export interface DrawingLineApi {
  readonly style_solid: LineStyle
  readonly style_dashed: LineStyle
  readonly style_dotted: LineStyle
  readonly style_arrow_left: LineStyle
  readonly style_arrow_right: LineStyle
  readonly style_arrow_both: LineStyle
  readonly new: LineFactory
  readonly all: readonly LineRef[]
  set_xy1(id: LineRef, x: number, y: number): void
  set_xy2(id: LineRef, x: number, y: number): void
  set_x1(id: LineRef, x: number): void
  set_y1(id: LineRef, y: number): void
  set_x2(id: LineRef, x: number): void
  set_y2(id: LineRef, y: number): void
  set_color(id: LineRef, color: string): void
  set_style(id: LineRef, style: LineStyle): void
  set_width(id: LineRef, width: number): void
  set_extend(id: LineRef, extend: LineExtend): void
  get_x1(id: LineRef): number
  get_y1(id: LineRef): number
  get_x2(id: LineRef): number
  get_y2(id: LineRef): number
  get_color(id: LineRef): string | null
  get_style(id: LineRef): LineStyle | null
  get_width(id: LineRef): number
  get_extend(id: LineRef): LineExtend | null
  get_price(id: LineRef, x: number): number
  copy(id: LineRef): LineRef | null
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
}
