/**
 * Plot 契约：脚本产出、图表渲染共同依赖的绘图数据模型。
 *
 * 本包只有类型、没有运行时代码，位于依赖图最底层：core 与 script 都依赖它，
 * 而它不依赖任何包。这样两个包互不认识，同时绘图数据只有这一处定义。
 */

/** 单个绘图点；缺省位置不绘制，`value` 为 NaN 表示 na。 */
export interface PlotPoint {
  value: number
  /** CSS 颜色字符串；缺省时使用所在 Plot 的颜色。 */
  color?: string
}

/** Plot 的公共信息。 */
interface PlotBase {
  readonly id: string
  readonly label: string
  /** 按 K 线下标对齐的绘图点，缺省表示该位置不绘制。 */
  readonly data: readonly (PlotPoint | undefined)[]
  readonly color: string
  readonly visible: boolean
  /** 沿 K 线下标的偏移，用于一目均衡表等前移或后移的序列。 */
  readonly offset: number
}

/** 折线；线宽与虚线可配置，空值处断开。 */
export interface LinePlot extends PlotBase {
  readonly kind: 'line'
  readonly width: number
  readonly dash: readonly number[]
}

/** 柱状图；柱宽随 K 线间距变化，`baseline` 为柱子起算的基准值。 */
export interface HistogramPlot extends PlotBase {
  readonly kind: 'histogram'
  readonly baseline: number
}

/** 圆形散点，不连接相邻数据。 */
export interface PointsPlot extends PlotBase {
  readonly kind: 'points'
  readonly radius: number
}

export type Plot = LinePlot | HistogramPlot | PointsPlot

/** 引用两个 Plot，填充它们之间的区域，不复制序列数据。 */
export interface PlotFill {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly visible: boolean
  readonly color: string
  /** from 高于 to 时使用的颜色，在交点处切换。 */
  readonly reverseColor: string
  readonly opacity: number
}

/** 一个指标实例产出的全部 Plot 与填充关系。 */
export interface PlotCollection {
  readonly plots: readonly Plot[]
  readonly fills: readonly PlotFill[]
}
