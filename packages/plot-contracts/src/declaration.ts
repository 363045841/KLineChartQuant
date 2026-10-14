/**
 * 声明式 Plot 契约：描述「画出什么形状、用什么样式」。
 *
 * 采集器据此把逐 bar 输出组装成 PlotCollection 中的 Plot；未声明的样式由采集器填入默认值。
 */

import type { ShapeOptions } from './shape.js'

/** 声明式 Plot 的公共信息。 */
interface PlotDeclarationBase {
  /** Plot 的唯一标识，与逐 bar 输出的 id 对应。 */
  readonly id: string
  /** 图例名称；缺省时取 id。 */
  readonly label?: string
  /** CSS 颜色字符串；缺省时取默认色。 */
  readonly color?: string
  /** 文字默认颜色；逐 bar 覆盖值由输出点携带。 */
  readonly textColor?: string
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

/** 固定 Shape 声明；缺省样式由共享构造器补齐。 */
export interface ShapePlotDeclaration extends PlotDeclarationBase, ShapeOptions {
  readonly kind: 'shape'
}

/** 声明的 Plot：按 kind 区分各图形及其专用字段。 */
export type PlotDeclaration =
  | LinePlotDeclaration
  | HistogramPlotDeclaration
  | PointsPlotDeclaration
  | ShapePlotDeclaration

/** plot 调用直接使用声明样式，kind 由调用的第一个参数提供。 */
export type PlotCallOptions =
  | Omit<LinePlotDeclaration, 'kind'>
  | Omit<HistogramPlotDeclaration, 'kind'>
  | Omit<PointsPlotDeclaration, 'kind'>
  | Omit<ShapePlotDeclaration, 'kind'>

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
  /** 反向颜色（from 高于 to 时）；缺省时回落到 color 或默认色。 */
  readonly reverseColor?: string
  /** 不透明度；缺省时取默认值。 */
  readonly opacity?: number
  /** 是否可见；缺省为 true。 */
  readonly visible?: boolean
}
