/** 编辑器中的脚本全局契约；复用执行器、行情序列与绘图声明的公开类型。 */

import type {
  BarPlotOptions,
  CandlePlotOptions,
  InputDef,
  InputOptions,
  NumberInputOptions,
  PlotCallOptions,
  PlotDeclaration,
  StringInputOptions,
  Timeframe,
  TimeframeInputOptions,
} from '@363045841yyt/klinechart-plot-contracts'
import type { QuickJSScriptDefinition } from '../quickjs/types.js'

/** 按输入类型声明默认值与对应选项，params 根据返回声明推导值类型。 */
export interface ScriptInput {
  /**
   * 整数输入；min、max 和 step 必须为整数。
   * @summary 整数
   */
  int(value: number, options?: NumberInputOptions): number
  /**
   * 浮点数输入，支持数值范围与步长。
   * @summary 浮点数
   */
  float(value: number, options?: NumberInputOptions): number
  /**
   * 布尔输入，在参数面板中显示开关。
   * @summary 开关
   */
  bool(value: boolean, options?: InputOptions): boolean
  /**
   * 字符串输入；提供 options 时显示下拉选项。
   * @summary 字符串
   */
  string(value: string, options?: StringInputOptions): string
  /**
   * 目标周期输入；缺省列出全部受支持周期，返回值可直接传给 request.security。
   * @summary 目标周期
   */
  timeframe(value: Timeframe, options?: TimeframeInputOptions): Timeframe
}

/** 调用处的样式选项；绘图名称由绘图方法的位置参数提供，color 可逐点变化。 */
export type ScriptPlotOptions = PlotCallOptions

/** plot.* 返回的绘图句柄；fill 借它引用两个 Plot。 */
export interface PlotRef {
  /** 句柄所属 Plot 的 name。 */
  readonly name: string
}

/** fill 第 5 个参数的可选样式；title 缺省时按 from/to 生成填充标识。 */
export interface ScriptFillOptions {
  /** 是否绘制填充；不填则绘制。 */
  readonly visible?: boolean
}

/** 从共享声明提取对应图形的样式选项，类型由方法名确定。 */
export type PlotStyleOptions<K extends PlotDeclaration['kind']> = Omit<
  Extract<PlotDeclaration, { kind: K }>,
  'kind' | 'name'
>

/** 当前 K 线绘图入口；name 必填，null 留空；单值方法返回 PlotRef，OHLC 方法返回 void。 */
export interface ScriptPlot {
  /**
   * 输出普通折线点，跨空值连接前后有效点，对应 Pine plot.style_line。
   * @summary 折线
   */
  Line(value: number | null, name: string, options?: PlotStyleOptions<'line'>): PlotRef
  /**
   * 输出断线折线点，空值处断开，对应 Pine plot.style_linebr。
   * @summary 断线折线
   */
  LineBR(value: number | null, name: string, options?: PlotStyleOptions<'linebr'>): PlotRef
  /**
   * 输出阶梯线点，在相邻有效点的水平中点跳变，跨空值连接，对应 Pine plot.style_stepline。
   * @summary 阶梯线
   */
  StepLine(value: number | null, name: string, options?: PlotStyleOptions<'stepline'>): PlotRef
  /**
   * 输出断线阶梯线点，空值处断开，对应 Pine plot.style_steplinebr。
   * @summary 断线阶梯线
   */
  StepLineBR(value: number | null, name: string, options?: PlotStyleOptions<'steplinebr'>): PlotRef
  /**
   * 固定像素柱宽；size 接受正数像素或 ShapeSize 枚举，默认 1px。
   * @summary 柱状图（定宽）
   */
  Histogram(value: number | null, name: string, options?: PlotStyleOptions<'histogram'>): PlotRef
  /**
   * 输出自动柱宽的柱状图，随 K 线间距缩放，不支持 size。
   * @summary 柱形图（跟随缩放）
   */
  Columns(value: number | null, name: string, options?: PlotStyleOptions<'columns'>): PlotRef
  /**
   * 输出散点。
   * @summary 散点
   */
  Point(value: number | null, name: string, options?: PlotStyleOptions<'points'>): PlotRef
  /**
   * 输出形状标记；false 留空，absolute 定位时数值为价格。
   * @summary 形状标记
   */
  Shape(value: number | boolean | null, name: string, options?: PlotStyleOptions<'shape'>): PlotRef
  /**
   * 输出字符标记；false 留空，absolute 定位时数值为价格。
   * @summary 字符标记
   */
  Char(value: number | boolean | null, name: string, options?: PlotStyleOptions<'char'>): PlotRef
  /**
   * 输出数值箭头，正负决定方向，绝对值决定长度。
   * @summary 箭头
   */
  Arrow(value: number | null, name: string, options?: PlotStyleOptions<'arrow'>): PlotRef
  /**
   * 输出蜡烛；任一价格缺失时留空，实体、影线和边框可独立着色。
   * @summary 蜡烛图
   */
  Candle(
    open: number | null,
    high: number | null,
    low: number | null,
    close: number | null,
    name: string,
    options?: CandlePlotOptions,
  ): void
  /**
   * 输出美国线；左侧短横线为开盘，右侧短横线为收盘。
   * @summary 美国线（OHLC）
   */
  Bar(
    open: number | null,
    high: number | null,
    low: number | null,
    close: number | null,
    name: string,
    options?: BarPlotOptions,
  ): void
}

/** 完整脚本的声明与逐 bar 执行回调。 */
export interface ScriptIndicatorDeclaration extends Omit<QuickJSScriptDefinition, 'inputs'> {
  /** 逐根 K 线调用一次 */
  onBar(): void
}
