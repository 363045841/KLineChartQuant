/**
 * 声明式 Plot 契约：描述「画出什么形状、用什么样式」。
 *
 * 采集器据此把逐 bar 输出组装成 PlotCollection 中的 Plot；未声明的样式由采集器填入默认值。
 */

import type { ArrowOptions, CharOptions, ShapeOptions, ShapeSize } from './shape.js'

/** 声明式 Plot 的公共样式。 */
interface PlotStyleBase {
  /** 图例名称；不填则取 name。 */
  readonly label?: string
  /** 图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。 */
  readonly color?: string
  /** 标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。 */
  readonly textColor?: string
  /** 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 */
  readonly offset?: number
  /** 是否显示图形；不填则显示。 */
  readonly visible?: boolean
  /**
   * 图形尺寸档位；不填则使用 ShapeSize.Auto。
   * 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度，柱状图控制柱宽。
   * 具体尺寸见 ShapeSize 的档位对照表。
   */
  readonly size?: ShapeSize
}

/** 声明式 Plot 的公共信息。 */
interface PlotDeclarationBase extends PlotStyleBase {
  /** 绘图名称，相同名称的数据会画在同一条线或同一组标记中。 */
  readonly name: string
}

/** 折线及其样式。 */
export interface LinePlotDeclaration extends PlotDeclarationBase {
  /** 绘图类型：折线。 */
  readonly kind: 'line'
  /** 虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。 */
  readonly dash?: readonly number[]
}

/** 柱状图及其样式。 */
export interface HistogramPlotDeclaration extends PlotDeclarationBase {
  /** 绘图类型：柱状图。 */
  readonly kind: 'histogram'
  /** 柱状图的起始基线值；不填则取 0。 */
  readonly baseline?: number
}

/** 点图 Plot 声明；散点直径由公共 size 决定。 */
export interface PointsPlotDeclaration extends PlotDeclarationBase {
  /** 绘图类型：散点。 */
  readonly kind: 'points'
}

/** 形状标记及其样式。 */
export interface ShapePlotDeclaration extends PlotDeclarationBase, ShapeOptions {
  /** 绘图类型：固定形状标记。 */
  readonly kind: 'shape'
}

/** 字符标记声明。 */
export interface CharPlotDeclaration extends PlotDeclarationBase, CharOptions {
  /** 绘图类型：字符标记。 */
  readonly kind: 'char'
}

/** 数值箭头声明。 */
export interface ArrowPlotDeclaration extends PlotDeclarationBase, ArrowOptions {
  /** 绘图类型：数值箭头，正负决定方向，绝对值决定长度。 */
  readonly kind: 'arrow'
}

/** 声明的 Plot：按 kind 区分各图形及其专用字段。 */
export type PlotDeclaration =
  | LinePlotDeclaration
  | HistogramPlotDeclaration
  | PointsPlotDeclaration
  | ShapePlotDeclaration
  | CharPlotDeclaration
  | ArrowPlotDeclaration

/** 绘图调用的样式选项；绘图名称由绘图方法的位置参数提供。 */
export interface PlotCallOptions
  extends PlotStyleBase,
    ShapeOptions,
    CharOptions,
    ArrowOptions,
    Pick<LinePlotDeclaration, 'dash'>,
    Pick<HistogramPlotDeclaration, 'baseline'> {}

/** 两个图形之间的填充区域及其样式。 */
export interface PlotFillDeclaration {
  /** 填充的唯一名称。 */
  readonly name: string
  /** 起始 Plot 的 name。 */
  readonly from: string
  /** 结束 Plot 的 name。 */
  readonly to: string
  /** 填充颜色，支持 CSS 颜色值；不填则使用默认颜色。 */
  readonly color?: string
  /** from 高于 to 时的填充颜色；不填则使用 color，color 也没填则使用默认颜色。 */
  readonly reverseColor?: string
  /** 填充的不透明度；不填则取 0.15。 */
  readonly opacity?: number
  /** 是否显示填充；不填则显示。 */
  readonly visible?: boolean
}
