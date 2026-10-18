/**
 * Plot 数据契约：脚本产出、图表渲染共同依赖的绘图数据模型。
 *
 * 本模块提供类型和共享枚举，位于依赖图最底层：core 与 script 都依赖它，
 * 而它不依赖任何包。这样两个包互不认识，同时绘图数据只有这一处定义。
 */

/** 单个有效绘图点；脚本的 null 和无效数值在采集时转为列中的缺省位置。 */
export interface PlotPoint {
  value: number
  /** CSS 颜色字符串；缺省时使用所在 Plot 的颜色。 */
  color?: string
  /** Shape 附带文字的逐 bar 颜色。 */
  textColor?: string
}
/** Plot 的公共信息。 */
export interface PlotBase {
  readonly id: string
  readonly label: string
  /** 按 K 线下标对齐的绘图点，缺省表示该位置不绘制。 */
  readonly data: readonly (PlotPoint | undefined)[]
  readonly color: string
  readonly visible: boolean
  /** 沿 K 线下标的偏移，用于一目均衡表等前移或后移的序列。 */
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

/** 柱宽随 K 线间距缩放，不支持手动柱宽。 */
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
  readonly textColor: string
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

/** 符号决定方向，绝对值决定屏幕高度的箭头；长度上限由 size 决定。 */
export interface ArrowPlot extends PlotBase {
  readonly kind: 'arrow'
  readonly colorUp: string
  readonly colorDown: string
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
  readonly showLast?: number
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

/** showLast 按整列长度裁剪，渲染、图例和自动缩放共享起点。 */
export function ohlcPlotStart(plot: OhlcPlot): number {
  return plot.showLast === undefined ? 0 : Math.max(0, plot.data.length - plot.showLast)
}

/** 引用两个 Plot，填充它们之间的区域，不复制序列数据。 */
export interface PlotFill {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly visible: boolean
  /** 按图表 bar 下标保存颜色；null 表示该 bar 不填充。 */
  readonly colors: readonly (string | null)[]
}

/** 一个指标实例产出的全部 Plot 与填充关系。 */
export interface PlotCollection {
  readonly plots: readonly Plot[]
  readonly fills: readonly PlotFill[]
}
