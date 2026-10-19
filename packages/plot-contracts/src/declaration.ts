/**
 * 声明式 Plot 契约：描述「画出什么形状、用什么样式」。
 *
 * 采集器据此把逐 bar 输出组装成 PlotCollection 中的 Plot；未声明的样式由采集器填入默认值。
 */

import type { Format } from './format.js'
import type { ArrowOptions, CharOptions, ShapeOptions, ShapeSize } from './shape.js'

/** 声明式 Plot 的公共样式。 */
export interface PlotStyleBase {
  /** 图例名称；不填则取 name。 */
  readonly label?: string
  /** 图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。 */
  readonly color?: string
  /** 数值格式档位；缺省继承指标级 format，用于图例数值显示。 */
  readonly format?: Format
  /** 标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。 */
  readonly textColor?: string
  /** 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 */
  readonly offset?: number
  /** 是否显示图形；不填则显示。 */
  readonly visible?: boolean
  /**
   * 图形尺寸档位；不填则使用 ShapeSize.Auto。
   * 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
   * 具体尺寸见 ShapeSize 的档位对照表。
   */
  readonly size?: ShapeSize
}

/** 声明式 Plot 的公共信息。 */
export interface PlotDeclarationBase extends PlotStyleBase {
  /** 绘图名称，相同名称的数据会画在同一条线或同一组标记中。 */
  readonly name: string
}

/** 普通折线及其样式，跨空值连接有效点。 */
export interface LinePlotDeclaration extends PlotDeclarationBase {
  /** 绘图类型：折线。 */
  readonly kind: 'line'
  /** 虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。 */
  readonly dash?: readonly number[]
}

/** 断线折线及其样式，空值处断开。 */
export interface LineBRPlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
  readonly kind: 'linebr'
}

/** 阶梯线声明，在相邻有效点的水平中点跳变，跨空值连接。 */
export interface StepLinePlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
  readonly kind: 'stepline'
}

/** 断线阶梯线声明，空值处断开。 */
export interface StepLineBRPlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
  readonly kind: 'steplinebr'
}

/** 柱状图及其样式。 */
export interface HistogramPlotDeclaration extends Omit<PlotDeclarationBase, 'size'> {
  /** 绘图类型：柱状图。 */
  readonly kind: 'histogram'
  /** 柱状图的起始基线值；不填则取 0。 */
  readonly baseline?: number
  /** 固定逻辑像素柱宽，或 Size 档位；默认 1px。 */
  readonly size?: ShapeSize | number
}

/** 自动柱宽随 K 线间距缩放，不支持 size。 */
export interface ColumnsPlotDeclaration extends Omit<PlotDeclarationBase, 'size'> {
  readonly kind: 'columns'
  readonly baseline?: number
  readonly size?: never
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
export type ScalarPlotDeclaration =
  | LinePlotDeclaration
  | LineBRPlotDeclaration
  | StepLinePlotDeclaration
  | StepLineBRPlotDeclaration
  | HistogramPlotDeclaration
  | ColumnsPlotDeclaration
  | PointsPlotDeclaration
  | ShapePlotDeclaration
  | CharPlotDeclaration
  | ArrowPlotDeclaration

/** 四价格图形的调用样式；颜色允许逐 bar 变化，null 隐藏对应部分。 */
export interface OhlcPlotOptions {
  readonly label?: string
  readonly visible?: boolean
  readonly offset?: number
  readonly showLast?: number
  readonly color?: string | null
  /** 数值格式档位；缺省继承指标级 format，用于图例数值显示。 */
  readonly format?: Format
}

/** 蜡烛实体、影线和边框可独立着色。 */
export interface CandlePlotOptions extends OhlcPlotOptions {
  readonly wickColor?: string | null
  readonly borderColor?: string | null
}

/** 美国线的竖线和左右短横线共用颜色。 */
export interface BarPlotOptions extends OhlcPlotOptions {}

export interface CandlePlotDeclaration extends CandlePlotOptions {
  readonly name: string
  readonly kind: 'candle'
}

export interface BarPlotDeclaration extends BarPlotOptions {
  readonly name: string
  readonly kind: 'bar'
}

export type OhlcPlotDeclaration = CandlePlotDeclaration | BarPlotDeclaration
export type PlotDeclaration = ScalarPlotDeclaration | OhlcPlotDeclaration

/** 绘图调用的样式选项；绘图名称由绘图方法的位置参数提供。 */
export interface PlotCallOptions
  extends Omit<PlotStyleBase, 'size'>,
    ShapeOptions,
    CharOptions,
    ArrowOptions,
    Pick<LinePlotDeclaration, 'dash'>,
    Pick<HistogramPlotDeclaration, 'baseline' | 'size'> {}

/** 两个图形之间的填充区域及其样式。 */
export interface PlotFillDeclaration {
  /** 填充的唯一名称。 */
  readonly name: string
  /** 起始 Plot 的 name。 */
  readonly from: string
  /** 结束 Plot 的 name。 */
  readonly to: string
  /** 当前 bar 的 CSS 颜色，透明度由颜色携带；null 表示不填充。 */
  readonly color: string | null
  /** 是否显示填充；不填则显示。 */
  readonly visible?: boolean
}
