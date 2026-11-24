/**
 * Plot 数据契约：脚本产出、图表渲染共同依赖的绘图数据模型。
 *
 * 本模块提供类型和共享枚举，位于依赖图最底层：core 与 script 都依赖它，
 * 而它不依赖任何包。这样两个包互不认识，同时绘图数据只有这一处定义。
 */

import type { HLine, HLineFill } from './hline.js'

/** 单个有效绘图点；颜色在采集时已物化为该 bar 的最终值。 */
export interface PlotPoint {
  readonly value: number
  /** 该 bar 的最终颜色；缺省色已由生产端填入，消费端不再回退。 */
  readonly color: string
  /** 标记文字色；标记点必须逐点提供，非标记点不携带。 */
  readonly textColor?: string
}

/** 标记点：文字色必填，图元端据此严格校验。 */
export interface MarkerPoint extends PlotPoint {
  readonly textColor: string
}

/** 识别标记点：标记数据必须逐点带文字色，图元端据此严格校验。 */
export function isMarkerPoint(point: PlotPoint): point is MarkerPoint {
  return typeof point.textColor === 'string'
}
/** Plot 的公共信息。 */
export interface PlotBase {
  readonly id: string
  readonly label: string
  /** 按 K 线下标对齐的绘图点，缺省表示该位置不绘制。 */
  readonly data: readonly (PlotPoint | undefined)[]
  /** 数值格式档位；已按 plot 级覆盖指标级解析完成，消费端直接使用。 */
  readonly format?: import('./format.js').Format
  readonly visible: boolean
  /** 沿 K 线下标的显示位移；一目均衡表等前移或后移的序列使用它。 */
  readonly offset: number
  /** 图形尺寸档位；渲染器据此换算成该类型的像素尺寸。 */
  readonly size: import('./shape.js').ShapeSize
}

/** 普通折线，跨空值连接前后有效点；线宽由 size 决定。 */
export interface LinePlot extends PlotBase {
  readonly kind: 'line'
  readonly dash: readonly number[]
}

/** 断线折线，空值处断开；与普通折线共享尺寸和虚线配置。 */
export interface LineBRPlot extends Omit<LinePlot, 'kind'> {
  readonly kind: 'linebr'
}

/** 阶梯线，在相邻有效点的水平中点跳变，跨空值连接。 */
export interface StepLinePlot extends Omit<LinePlot, 'kind'> {
  readonly kind: 'stepline'
}

/** 断线阶梯线，空值处断开。 */
export interface StepLineBRPlot extends Omit<LinePlot, 'kind'> {
  readonly kind: 'steplinebr'
}

/** 固定像素柱宽的柱状图，`baseline` 为柱子起算的基准值。 */
export interface HistogramPlot extends Omit<PlotBase, 'size'> {
  readonly kind: 'histogram'
  readonly baseline: number
  /** 固定逻辑像素柱宽，或映射为像素的尺寸档位。 */
  readonly size: import('./shape.js').ShapeSize | number
}

/** 填充时间槽位，左右各留 1 个物理像素；不跟随蜡烛实体宽度，不支持手动柱宽。 */
export interface ColumnsPlot extends PlotBase {
  readonly kind: 'columns'
  readonly baseline: number
}

/** 圆形散点，不连接相邻数据；直径由 size 决定。 */
export interface PointsPlot extends PlotBase {
  readonly kind: 'points'
}

/**
 * 固定形状标记；样式由声明决定，数据沿用统一的逐 bar 列。
 * 相对定位只用 bar 的位置，`value` 只表示该 bar 有无信号；absolute 把 `value` 当价格。
 */
export interface MarkerPlot extends PlotBase {
  readonly location: import('./shape.js').ShapeLocation
  readonly text: string
}

/** 固定形状标记。 */
export interface ShapePlot extends MarkerPlot {
  readonly kind: 'shape'
  readonly style: import('./shape.js').ShapeStyle
}

/** 固定 Unicode 字符标记。 */
export interface CharPlot extends MarkerPlot {
  readonly kind: 'char'
  readonly char: string
}

/** 符号决定方向，绝对值决定屏幕高度的箭头；方向色已物化为逐点颜色。 */
export interface ArrowPlot extends PlotBase {
  readonly kind: 'arrow'
}

export type ScalarPlot =
  | LinePlot
  | LineBRPlot
  | StepLinePlot
  | StepLineBRPlot
  | HistogramPlot
  | ColumnsPlot
  | PointsPlot
  | ShapePlot
  | CharPlot
  | ArrowPlot

/** 一根完整 OHLC；各部分颜色已由生产端解析，null 表示不绘制。 */
export interface OhlcPlotPoint {
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly color: string | null
  readonly wickColor: string | null
  readonly borderColor: string | null
}

/** OHLC 图形不提供单值填充边界，宽度跟随 K 线间距。 */
export interface OhlcPlotBase extends Omit<PlotBase, 'data' | 'size'> {
  readonly data: readonly (OhlcPlotPoint | undefined)[]
}

/** 蜡烛图，包含独立着色的实体、影线和边框。 */
export interface CandlePlot extends OhlcPlotBase {
  readonly kind: 'candle'
}

/** 美国线，整根图形使用同一颜色。 */
export interface BarPlot extends OhlcPlotBase {
  readonly kind: 'bar'
}

export type OhlcPlot = CandlePlot | BarPlot

export type Plot = ScalarPlot | OhlcPlot

export type PlotKind = Plot['kind']

/**
 * @summary 绘图类型
 *
 * 脚本 `plot.*` 的图形种类；取值与 Plot 声明的 `kind` 完全一致。
 */
export const PlotKind = {
  /** @summary 折线 */
  Line: 'line',
  /** @summary 断线折线 */
  LineBR: 'linebr',
  /** @summary 阶梯线 */
  StepLine: 'stepline',
  /** @summary 断线阶梯线 */
  StepLineBR: 'steplinebr',
  /** @summary 柱状图 */
  Histogram: 'histogram',
  /** @summary 柱形图 */
  Columns: 'columns',
  /** @summary 散点 */
  Points: 'points',
  /** @summary 形状标记 */
  Shape: 'shape',
  /** @summary 字符标记 */
  Char: 'char',
  /** @summary 箭头 */
  Arrow: 'arrow',
  /** @summary 蜡烛图 */
  Candle: 'candle',
  /** @summary 美国线 */
  Bar: 'bar',
} satisfies Record<string, PlotKind>

/** 判断绘图类型，供跨 VM 边界校验使用。 */
export function isPlotKind(value: unknown): value is PlotKind {
  return Object.values(PlotKind).some((entry) => entry === value)
}

/** 只有价格定位的 Plot 可以参与数值轴范围和曲线填充。 */
export function isPricePlot(plot: Plot): boolean {
  switch (plot.kind) {
    case 'shape':
    case 'char':
      return plot.location === 'absolute'
    case 'arrow':
      return false
    case 'line':
    case 'linebr':
    case 'stepline':
    case 'steplinebr':
    case 'histogram':
    case 'columns':
    case 'points':
    case 'candle':
    case 'bar':
      return true
  }
}

/** 校验填充引用；脚本收集器和原生指标投影使用同一套价格边界规则。 */
export function validatePlotFills(plots: readonly Plot[], fills: readonly PlotFill[]): void {
  const sources = new Map(plots.map((plot) => [plot.id, plot]))
  for (const fill of fills) {
    const from = sources.get(fill.from)
    const to = sources.get(fill.to)
    if (!from || !to) throw new TypeError(`Unknown fill source: ${fill.id}`)
    if (!isPricePlot(from) || !isPricePlot(to) || isOhlcPlot(from) || isOhlcPlot(to))
      throw new TypeError(`Fill ${fill.id} requires price-positioned plots`)
  }
}

/** 按判别字段识别四价格图形，消费端据此读取完整 OHLC。 */
export function isOhlcPlot(plot: Plot): plot is OhlcPlot {
  return plot.kind === PlotKind.Candle || plot.kind === PlotKind.Bar
}

/**
 * 把 `showLast` 物化为列：只保留末尾 N 个点，其余位置清空。
 *
 * @param data 源列
 * @param showLast 只保留末尾根数；缺省保留全部
 */
export function keepPlotTail<T>(
  data: readonly (T | undefined)[],
  showLast: number | undefined,
): readonly (T | undefined)[] {
  if (showLast === undefined) return data
  const start = Math.max(0, data.length - showLast)
  return data.map((point, index) => (index < start ? undefined : point))
}

/**
 * 取显示下标处的绘图点；位移在这里统一换算，消费端不再各自减 offset。
 *
 * @param plot 任一 Plot 或 PlotBase
 * @param index 图表 bar 下标（显示下标）
 */
export function plotPointAt<T>(
  plot: { readonly data: readonly (T | undefined)[]; readonly offset: number },
  index: number,
): T | undefined {
  return plot.data[index - plot.offset]
}

/**
 * 显示下标的上界（开区间）：正向位移把点推到未来，遍历时允许超出数据长度。
 *
 * @param plot 任一 Plot 或 PlotBase
 */
export function plotIndexEnd(plot: {
  readonly data: readonly unknown[]
  readonly offset: number
}): number {
  return plot.data.length + plot.offset
}

/** 引用两个 Plot，填充它们之间的区域，不复制序列数据。 */
export interface PlotFill {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly visible: boolean
  /** 按图表 bar 下标保存颜色，与 Plot.data 同下标；null 表示该 bar 不填充。 */
  readonly colors: readonly (string | null)[]
}

/** 一个指标实例产出的全部 Plot 与填充关系。 */
export interface IndicatorSeries {
  readonly plots: readonly Plot[]
  readonly fills: readonly PlotFill[]
  /** 脚本 hline 声明的图表级水平线；旧版生产端可能没有该字段。 */
  readonly hlines?: readonly HLine[]
  /** 两条水平线之间的整幅填充；与 hlines 的 id 对应。 */
  readonly hlineFills?: readonly HLineFill[]
  readonly drawings?: readonly import('./drawing.js').DrawingObject[]
}
