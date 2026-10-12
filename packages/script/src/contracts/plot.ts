/**
 * Plot 数据模型：按 K 线对齐的绘图序列、序列之间的填充关系，
 * 以及脚本可选的 Plot / 填充声明。
 */
import type { PlotPoint } from './output.js'

/** Plot 的公共信息；缺少数据点或 NaN 表示该位置不绘制。 */
interface PlotBase {
  readonly id: string
  readonly label: string
  readonly data: readonly (PlotPoint | undefined)[]
  readonly color: string
  readonly visible: boolean
  /** 沿 K 线下标的偏移，用于一目均衡表等前移或后移的序列。 */
  readonly offset: number
}

export interface LinePlot extends PlotBase {
  readonly kind: 'line'
  readonly width: number
  readonly dash: readonly number[]
}

export interface HistogramPlot extends PlotBase {
  readonly kind: 'histogram'
  readonly baseline: number
}

export interface PointsPlot extends PlotBase {
  readonly kind: 'points'
  readonly radius: number
}

export type Plot = LinePlot | HistogramPlot | PointsPlot

/** 声明式 Plot 的公共信息；未声明的样式由采集器填入默认值。 */
interface PlotDeclarationBase {
  /** Plot 的唯一标识，与 ctx.plot 的 id 对应。 */
  readonly id: string
  /** 图例名称；缺省时取 id。 */
  readonly label?: string
  /** CSS 颜色字符串；缺省时取默认色。 */
  readonly color?: string
  /** 沿 K 线下标的偏移；缺省为 0。 */
  readonly offset?: number
  /** 是否可见；缺省为 true。 */
  readonly visible?: boolean
}

/** 折线 Plot 声明；width / dash 缺省时取默认值。 */
export interface LinePlotDeclaration extends PlotDeclarationBase {
  readonly kind: 'line'
  readonly width?: number
  readonly dash?: readonly number[]
}

/** 柱状图 Plot 声明；baseline 缺省为 0。 */
export interface HistogramPlotDeclaration extends PlotDeclarationBase {
  readonly kind: 'histogram'
  readonly baseline?: number
}

/** 点图 Plot 声明；radius 缺省时取默认值。 */
export interface PointsPlotDeclaration extends PlotDeclarationBase {
  readonly kind: 'points'
  readonly radius?: number
}

/** 脚本声明的 Plot：按 kind 区分折线 / 柱状图 / 点图。 */
export type PlotDeclaration = LinePlotDeclaration | HistogramPlotDeclaration | PointsPlotDeclaration

/** 引用两个 Plot，填充它们之间的区域，不复制序列数据。 */
export interface PlotFill {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly visible: boolean
  readonly color: string
  readonly reverseColor: string
  readonly opacity: number
}

/** 声明式填充：引用两个 Plot id，样式缺省时由采集器填入默认值。 */
export interface PlotFillDeclaration {
  /** 填充的唯一标识。 */
  readonly id: string
  /** 起始 Plot id。 */
  readonly from: string
  /** 结束 Plot id。 */
  readonly to: string
  /** CSS 颜色字符串；缺省时取默认色。 */
  readonly color?: string
  /** 反向颜色（from 低于 to 时）；缺省时回落到 color 或默认色。 */
  readonly reverseColor?: string
  /** 不透明度；缺省时取默认值。 */
  readonly opacity?: number
  /** 是否可见；缺省为 true。 */
  readonly visible?: boolean
}

export interface PlotCollection {
  readonly plots: readonly Plot[]
  readonly fills: readonly PlotFill[]
}
