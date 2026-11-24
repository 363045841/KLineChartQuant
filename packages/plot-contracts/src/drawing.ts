/** 手绘与脚本共用的对象、坐标、样式和 Pine 风格 line API 契约。 */
import type { Color } from './color.js'

/** 线型：实线、虚线与箭头；手绘和 line API 共用。 */
export const LineStyle = {
  /** @summary 实线 */
  solid: 'solid',
  /** @summary 虚线 */
  dashed: 'dashed',
  /** @summary 点线 */
  dotted: 'dotted',
  /** @summary 左箭头 */
  arrowLeft: 'arrow_left',
  /** @summary 右箭头 */
  arrowRight: 'arrow_right',
  /** @summary 双箭头 */
  arrowBoth: 'arrow_both',
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
 * barIndex 从当前已加载数据的第一根算起；左侧加载更多历史后，同一根 K 线的序号会变大。
 * 允许范围是 0 到当前 barIndex，再向右最多 500 根；越界直接报错。
 * 要让线段跨历史保持在固定的 K 线上，用 bar_time 传 time[offset]。
 */
export const xloc = {
  /** @summary 第几根 K 线 */
  barIndex: 'bar_index',
  /** @summary 毫秒时间戳 */
  barTime: 'bar_time',
} as const
export type LineXLoc = (typeof xloc)[keyof typeof xloc]
export type DrawingStyle = {
  /** 线条颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。 */
  stroke: Color | (string & {})
  strokeWidth?: number
  strokeStyle?: LineStyle
  /** 填充颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。 */
  fill?: Color | (string & {})
  fillOpacity?: number
  pointRadius?: number
  /** 标签文字颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。 */
  textColor?: Color | (string & {})
  fontSize?: number
}
export type DrawingLabelPosition = 'start' | 'center' | 'end'

/** 点锚点：时间（或脚本索引）与价格共同定位。 */
export type PointDrawingAnchor = {
  id: string
  /** 缺省即点锚点，用于兼容早期持久化数据。 */
  type?: 'point'
  time?: number | string
  logicalIndex?: number
  price: number
}

/** 水平类锚点：只有价格轴，时间轴不参与定位。 */
export type HorizontalDrawingAnchor = {
  id: string
  type: 'horizontal'
  logicalIndex?: number
  price: number
  time?: never
}

/** 垂直类锚点：只有时间轴；渲染与命中都不需要价格。 */
export type VerticalDrawingAnchor = {
  id: string
  type: 'vertical'
  time?: number | string
  logicalIndex?: number
  price?: never
}

/** 时间锚点用于用户文档；logicalIndex 对应脚本当前运行的数据。 */
export type PersistedDrawingAnchor =
  | PointDrawingAnchor
  | HorizontalDrawingAnchor
  | VerticalDrawingAnchor
export type DrawingKind =
  | 'trend-line'
  | 'ray'
  | 'extended-line'
  | 'fib-retracement'
  | 'rectangle'
  | 'label'
  | 'arrow'
  | 'horizontal-line'
  | 'horizontal-ray'
  | 'vertical-line'
  | 'cross-line'
  | 'info-line'
  | 'parallel-channel'
  | 'regression-channel'
  | 'flat-line'
  | 'disjoint-channel'
export type DrawingLabel = { text: string; position: DrawingLabelPosition }
export type DrawingLabelTarget =
  | 'line'
  | 'horizontal'
  | 'vertical'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'inside'
  | 'base'
  | 'opposite'
  | 'median'
  | 'upper'
  | 'lower'
  | `level:${number}`
export type DrawingLabels = Partial<Record<DrawingLabelTarget, DrawingLabel>>
export type DrawingWorkspaceId = 'kline' | 'timeshare'
/** 周期可见性规则；参考周期在用户选择时确定。 */
export type TimeframeVisibility =
  | { readonly mode: 'all' }
  | {
      readonly mode: 'above' | 'below' | 'current'
      readonly period: string
    }

export type DrawingTimeframeVisibility = TimeframeVisibility

/** 唯一图形模型；ownerId 存在时归指标管理，不参与用户交互及历史。 */
export type DrawingObject<TParams = Record<string, unknown>> = {
  id: string
  kind: DrawingKind
  paneId: string
  workspaceId?: DrawingWorkspaceId
  /** 用户文档的稳定标的身份；周期不参与身份，指标图元由运行上下文管理。 */
  symbolKey?: string
  ownerId?: string
  visible: boolean
  /** 周期可见性规则；缺省表示所有周期可见。 */
  timeframeVisibility?: DrawingTimeframeVisibility
  locked?: boolean
  zIndex?: number
  anchors: PersistedDrawingAnchor[]
  labels?: DrawingLabels
  params: TParams
  style: DrawingStyle
  /** line API 声明的绝对坐标单位；手绘的 bar 身份锚点由 anchors 自身表达。 */
  xloc?: LineXLoc
  extend?: LineExtend
  /** Box 和 Label 的文字由公共 Text 图元绘制。 */
  text?: DrawingText
}

/**
 * 对象文字内容与排版；颜色和字号属于图元样式，统一放在 DrawingStyle.textColor / fontSize。
 *
 * 文字是绘制结果的一部分，不再保留自己的颜色与字号，避免同一属性存两份、
 * 让主题色解析只能覆盖其中一份。
 */
export interface DrawingText {
  value: string
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  /** 垂直像素偏移；正数向上，0 表示贴合锚点。点标签与 Box 文字消费。 */
  offsetY?: number
}

/** Box 的边框不包含箭头。 */
export type BoxBorderStyle = 'solid' | 'dashed' | 'dotted'
/** Box 对象引用，仅在所属运行中有效。 */
export interface BoxRef {
  readonly id: string
}
/** Label 对象引用，仅在所属运行中有效。 */
export interface LabelRef {
  readonly id: string
}
/** Box 的选项对象形态；只写需要的字段，省略只接受单一取值的参数。 */
export interface BoxOptions {
  /** 左边界；按 xloc 读取索引或时间戳。 */
  readonly left: number
  /** 上边界价格。 */
  readonly top: number
  /** 右边界；规则同 left。 */
  readonly right: number
  /** 下边界价格。 */
  readonly bottom: number
  /** 边框颜色，缺省 Color.blue。 */
  readonly borderColor?: Color | (string & {})
  /** 边框宽度，逻辑像素；0 表示不画边框。 */
  readonly borderWidth?: number
  /** 边框线型，缺省 solid。 */
  readonly borderStyle?: BoxBorderStyle
  /** 延伸方向，缺省不延伸。 */
  readonly extend?: LineExtend
  /** X 坐标单位，缺省 barIndex。 */
  readonly xloc?: LineXLoc
  /** 填充颜色；缺省与边框同色。 */
  readonly backgroundColor?: Color | (string & {})
  /** 框内文字，缺省为空。 */
  readonly text?: string
  /** 文字字号，缺省 12。 */
  readonly textSize?: number
  /** 文字颜色；缺省跟随边框颜色。 */
  readonly textColor?: Color | (string & {})
}
/** Pine 风格 Box 创建重载；可选参数顺序与 Pine 相同。 */
export interface BoxFactory {
  (
    left: number,
    top: number,
    right: number,
    bottom: number,
    border_color?: Color | (string & {}),
    border_width?: number,
    border_style?: BoxBorderStyle,
    extend?: LineExtend,
    xloc?: LineXLoc,
    bgcolor?: Color | (string & {}),
    text?: string,
    text_size?: number,
    text_color?: Color | (string & {}),
  ): BoxRef
  (
    top_left: ChartPoint,
    bottom_right: ChartPoint,
    border_color?: Color | (string & {}),
    border_width?: number,
    border_style?: BoxBorderStyle,
    extend?: LineExtend,
    xloc?: LineXLoc,
    bgcolor?: Color | (string & {}),
    text?: string,
    text_size?: number,
    text_color?: Color | (string & {}),
  ): BoxRef
  /**
   * 选项对象形态：字段与位置参数等价，未写的字段取默认值。
   * @summary 绘制矩形
   */
  (options: BoxOptions): BoxRef
}
/** 跨 bar 保留的矩形对象；复用手绘 rectangle 模型。 */
export interface DrawingBoxApi {
  readonly new: BoxFactory
  readonly all: readonly BoxRef[]
  setLeft(id: BoxRef, left: number): void
  setTop(id: BoxRef, top: number): void
  setRight(id: BoxRef, right: number): void
  setBottom(id: BoxRef, bottom: number): void
  setLeftTop(id: BoxRef, left: number, top: number): void
  setRightBottom(id: BoxRef, right: number, bottom: number): void
  setTopLeftPoint(id: BoxRef, point: ChartPoint): void
  setBottomRightPoint(id: BoxRef, point: ChartPoint): void
  setXLoc(id: BoxRef, left: number, right: number, xloc: LineXLoc): void
  setExtend(id: BoxRef, extend: LineExtend): void
  setBgColor(id: BoxRef, color: Color | (string & {})): void
  setBorderColor(id: BoxRef, color: Color | (string & {})): void
  setBorderWidth(id: BoxRef, width: number): void
  setBorderStyle(id: BoxRef, style: BoxBorderStyle): void
  setText(id: BoxRef, text: string): void
  setTextColor(id: BoxRef, color: Color | (string & {})): void
  setTextSize(id: BoxRef, size: number): void
  setTextHAlign(id: BoxRef, align: DrawingText['align']): void
  setTextVAlign(id: BoxRef, align: DrawingText['verticalAlign']): void
  getLeft(id: BoxRef): number
  getTop(id: BoxRef): number
  getRight(id: BoxRef): number
  getBottom(id: BoxRef): number
  copy(id: BoxRef): BoxRef | null
  delete(id: BoxRef | null): void
}
/** Label 的选项对象形态；只写需要的字段，省略 location/style 这类只有一个取值的参数。 */
export interface LabelOptions {
  /** 锚点 X；按 xloc 读取索引或时间戳。 */
  readonly x: number
  /** 锚点价格。 */
  readonly y: number
  /** 文字，缺省为空字符串。 */
  readonly text?: string
  /** X 坐标单位，缺省 barIndex。 */
  readonly xloc?: LineXLoc
  /** 文字颜色；同时作为标签颜色。 */
  readonly color?: Color | (string & {})
  /** 文字颜色覆盖；缺省跟随 color。 */
  readonly textColor?: Color | (string & {})
  /** 字号，逻辑像素，缺省 12。 */
  readonly size?: number
  /** 水平对齐，缺省 center。 */
  readonly align?: DrawingText['align']
  /** 垂直偏移，逻辑像素，正数向上，缺省 0。 */
  readonly offsetY?: number
}
/** Pine 风格 Label 创建重载：位置参数与选项对象等价。 */
export interface LabelFactory {
  /**
   * 位置参数形态，顺序与 Pine 相同。
   * @summary 绘制标签
   *
   * | 参数 | 含义 |
   * | --- | --- |
   * | `x` / `y` | 锚点；x 按 xloc 读取，y 为价格 |
   * | `text` | 文本，默认空字符串 |
   * | `xloc` | 决定 X 是第几根 K 线还是毫秒时间戳，默认第几根 |
   * | `location` | 目前只支持价格锚点（`"price"`） |
   * | `color` | 标签颜色，默认 Color.blue |
   * | `style` | 只支持无背景样式（label.styleNone） |
   * | `textcolor` | 文字颜色，缺省跟随 `color` |
   * | `size` | 字号，正整数逻辑像素，默认 12 |
   * | `textalign` | 水平对齐，默认 center |
   * | `offsetY` | 垂直偏移，逻辑像素，正数向上，默认 0 |
   */
  (
    x: number,
    y: number,
    text?: string,
    xloc?: LineXLoc,
    location?: 'price',
    color?: Color | (string & {}),
    style?: 'none',
    textcolor?: Color | (string & {}),
    size?: number,
    textalign?: DrawingText['align'],
    offsetY?: number,
  ): LabelRef
  /**
   * 选项对象形态：字段与位置参数等价，未写的字段取默认值。
   * @summary 绘制标签
   */
  (options: LabelOptions): LabelRef
}
/** 第一版 Label 使用价格锚点和纯文字样式，与 Pine styleNone 对应。 */
export interface DrawingLabelApi {
  readonly styleNone: 'none'
  /**
   * 绘制价格锚点标签，位置参数或选项对象二选一。
   * @summary 绘制标签
   *
   * 返回标签引用；超过 maxLabelsCount 时最旧的标签被回收。
   */
  readonly new: LabelFactory
  readonly all: readonly LabelRef[]
  setX(id: LabelRef, x: number): void
  setY(id: LabelRef, y: number): void
  setXY(id: LabelRef, x: number, y: number): void
  setText(id: LabelRef, text: string): void
  setTextColor(id: LabelRef, color: Color | (string & {})): void
  setSize(id: LabelRef, size: number): void
  setTextAlign(id: LabelRef, align: DrawingText['align']): void
  /**
   * 设置垂直偏移；逻辑像素，正数向上。
   * @summary 设置垂直偏移
   */
  setYOffset(id: LabelRef, offsetY: number): void
  getX(id: LabelRef): number
  getY(id: LabelRef): number
  getText(id: LabelRef): string | null
  /**
   * 读取垂直偏移；标签已删除返回 0。
   * @summary 垂直偏移
   */
  getYOffset(id: LabelRef): number
  copy(id: LabelRef): LabelRef | null
  delete(id: LabelRef | null): void
}
/** Box 和 Label 的运行上下文，限额在声明时归一化。 */
export interface DrawingObjectContext {
  readonly paneId: string
  readonly ownerId?: string
  readonly barCount: number
  readonly maxObjects: number
}
/**
 * 声明式修改：undefined 表示不修改，style 按字段合并而不是整体替换。
 * 手绘命令、脚本结果与 Agent 共用同一份字段语义。
 */
export type DrawingPatch = {
  readonly anchors?: ReadonlyArray<PersistedDrawingAnchor> | undefined
  readonly style?: Partial<DrawingStyle> | undefined
  readonly params?: Readonly<Record<string, unknown>> | undefined
  readonly labels?: DrawingLabels | undefined
  readonly visible?: boolean | undefined
  readonly timeframeVisibility?: DrawingTimeframeVisibility | undefined
  readonly locked?: boolean | undefined
  readonly zIndex?: number | undefined
}
/** 指标归属禁用全部交互；与用户的移动锁定分开。 */
export function isDrawingInteractive(drawing: DrawingObject): boolean {
  return drawing.ownerId === undefined
}
/** chart.point 值对象；绘制线段时复制坐标。 */
export interface ChartPoint {
  /** bar 索引；xloc.barIndex 时 line 读取该字段。 */
  readonly index?: number
  /** K 线时间戳（毫秒）；xloc.barTime 时 line 读取该字段。 */
  readonly time?: number
  /** 价格。 */
  readonly price: number
}
/** 不暴露可修改对象本身的引用，只在所属运行内有效。 */
export interface LineRef {
  /** 对象标识；同一对象在 line.all 与创建结果中是同一个引用。 */
  readonly id: string
}
/** Line 的选项对象形态；只写需要的字段，等价于位置参数。 */
export interface LineOptions {
  /** 起点 X；按 xloc 读取索引或时间戳。 */
  readonly x1: number
  /** 起点价格。 */
  readonly y1: number
  /** 终点 X；规则同 x1。 */
  readonly x2: number
  /** 终点价格。 */
  readonly y2: number
  /** X 坐标单位，缺省 barIndex。 */
  readonly xloc?: LineXLoc
  /** 延伸方向，缺省不延伸。 */
  readonly extend?: LineExtend
  /** 颜色，缺省 Color.blue。 */
  readonly color?: Color | (string & {})
  /** 线型或箭头，缺省实线。 */
  readonly style?: LineStyle
  /** 线宽，逻辑像素，缺省 1。 */
  readonly width?: number
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
   * | `xloc` | 决定 X 是第几根 K 线还是毫秒时间戳，默认第几根（xloc.barIndex） |
   * | `extend` | 延伸方向，默认 extend.none |
   * | `color` | 颜色，默认 Color.blue；可用 Color 枚举或任意 CSS 颜色值 |
   * | `style` | 线型或箭头，默认 LineStyle.solid |
   * | `width` | 线宽，正整数逻辑像素，默认 1 |
   *
   * barIndex 从当前已加载数据的第一根算起，左侧加载更多历史后序号会变大；不在 0 到当前 barIndex + 500 之内会直接报错。要跨历史固定在某根 K 线上，用 xloc.barTime 传 time[offset]。
   *
   * 返回线段引用；超过 maxLinesCount 时最旧的线段被回收。
   */
  (
    first_point: ChartPoint,
    second_point: ChartPoint,
    xloc?: LineXLoc,
    extend?: LineExtend,
    color?: Color | (string & {}),
    style?: LineStyle,
    width?: number,
  ): LineRef
  /**
   * 直接给出起止点的 X / Y 绘制线段。
   * @summary 绘制线段
   *
   * | 参数 | 含义 |
   * | --- | --- |
   * | `x1` | 起点 X；barIndex 时为索引，bar_time 时为毫秒时间戳 |
   * | `y1` | 起点价格 |
   * | `x2` | 终点 X；规则同 x1 |
   * | `y2` | 终点价格 |
   * | `xloc` | 决定 X 是第几根 K 线还是毫秒时间戳，默认第几根（xloc.barIndex） |
   * | `extend` | 延伸方向，默认 extend.none |
   * | `color` | 颜色，默认 Color.blue；可用 Color 枚举或任意 CSS 颜色值 |
   * | `style` | 线型或箭头，默认 LineStyle.solid |
   * | `width` | 线宽，正整数逻辑像素，默认 1 |
   *
   * barIndex 从当前已加载数据的第一根算起，左侧加载更多历史后序号会变大；不在 0 到当前 barIndex + 500 之内会直接报错。要跨历史固定在某根 K 线上，用 xloc.barTime 传 time[offset]。
   *
   * 返回线段引用。
   */
  (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    xloc?: LineXLoc,
    extend?: LineExtend,
    color?: Color | (string & {}),
    style?: LineStyle,
    width?: number,
  ): LineRef
  /**
   * 选项对象形态：字段与位置参数等价，未写的字段取默认值。
   * @summary 绘制线段
   */
  (options: LineOptions): LineRef
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
 * | `line.new(...)` | 绘制线段，超出 maxLinesCount 时回收最旧 |
 * | `line.set_*` | 修改端点、颜色、线型、线宽或延伸 |
 * | `line.get_*` | 读取对应属性；已删除返回 NaN 或 null |
 * | `line.getPrice(id, x)` | 按线段所在直线求价格，只支持 barIndex |
 * | `line.copy` / `line.delete` | 复制为新线段 / 删除线段 |
 */
export interface DrawingLineApi {
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
  setXY1(id: LineRef, x: number, y: number): void
  /**
   * 同时设置终点 X 和 Y；X 的取值方式沿用创建时的 xloc。
   * @summary 设置终点
   */
  setXY2(id: LineRef, x: number, y: number): void
  /**
   * 设置起点 X；取值方式沿用创建时的 xloc。
   * @summary 设置起点 X
   */
  setX1(id: LineRef, x: number): void
  /**
   * 设置起点价格。
   * @summary 设置起点价格
   */
  setY1(id: LineRef, y: number): void
  /**
   * 设置终点 X；取值方式沿用创建时的 xloc。
   * @summary 设置终点 X
   */
  setX2(id: LineRef, x: number): void
  /**
   * 设置终点价格。
   * @summary 设置终点价格
   */
  setY2(id: LineRef, y: number): void
  /**
   * 设置线段颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。
   * @summary 设置颜色
   */
  setColor(id: LineRef, color: Color | (string & {})): void
  /**
   * 设置线型，包括实线、虚线和箭头。
   * @summary 设置线型
   */
  setStyle(id: LineRef, style: LineStyle): void
  /**
   * 设置线宽，正整数逻辑像素。
   * @summary 设置线宽
   */
  setWidth(id: LineRef, width: number): void
  /**
   * 设置延伸方向；left 延伸至起点之外，right 延伸至终点之外。
   * @summary 设置延伸
   */
  setExtend(id: LineRef, extend: LineExtend): void
  /**
   * 读取起点 X；线段已删除返回 NaN。
   * @summary 起点 X
   */
  getX1(id: LineRef): number
  /**
   * 读取起点价格；线段已删除返回 NaN。
   * @summary 起点价格
   */
  getY1(id: LineRef): number
  /**
   * 读取终点 X；线段已删除返回 NaN。
   * @summary 终点 X
   */
  getX2(id: LineRef): number
  /**
   * 读取终点价格；线段已删除返回 NaN。
   * @summary 终点价格
   */
  getY2(id: LineRef): number
  /**
   * 读取颜色；线段已删除返回 null。
   * @summary 颜色
   */
  getColor(id: LineRef): string | null
  /**
   * 读取线型；线段已删除返回 null。
   * @summary 线型
   */
  getStyle(id: LineRef): LineStyle | null
  /**
   * 读取线宽；线段已删除返回 NaN。
   * @summary 线宽
   */
  getWidth(id: LineRef): number
  /**
   * 读取延伸方向；线段已删除返回 null。
   * @summary 延伸方向
   */
  getExtend(id: LineRef): LineExtend | null
  /**
   * 按线段所在直线求 x 处的价格，与 extend 无关；只支持 xloc.barIndex，垂直线或已删除返回 NaN。
   * @summary 求价格
   */
  getPrice(id: LineRef, x: number): number
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
  /** 原子追加一批对象并删除指定 ID；文档一次快照提交，VM 原地写入。 */
  append(drawings: readonly DrawingObject[], removeIds: readonly string[]): void
  nextId(): string
  /** 外部回滚计数；变化时 API 重新同步引用，避免已撤销的 id 继续占用限额。 */
  epoch(): number
}
export interface DrawingLineContext {
  readonly paneId: string
  readonly ownerId?: string
  readonly defaultColor: Color | (string & {})
  readonly maxLines: number
  /** 当前已执行的 K 线根数（barIndex + 1）；用于校验 barIndex 坐标的范围。 */
  readonly barCount: number
}
