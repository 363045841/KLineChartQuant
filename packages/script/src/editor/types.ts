/** 编辑器中的脚本全局契约；复用执行器、行情序列与绘图声明的公开类型。 */

import type { PlotCallOptions, PlotDeclaration } from '@363045841yyt/klinechart-plot-contracts'
import type { QuickJSScriptDefinition } from '../quickjs/types.js'

/** 调用处的绘图选项；color 可逐点变化。 */
export type ScriptPlotOptions = PlotCallOptions

/** 从共享声明提取对应图形的调用选项，类型由方法名确定。 */
type PlotOptions<K extends PlotDeclaration['kind']> = Omit<
  Extract<PlotDeclaration, { kind: K }>,
  'kind'
>

/** 当前 K 线的绘图入口；null 主动留空，形状和字符也接受布尔条件。 */
export interface ScriptPlot {
  /** 输出折线点。 */
  Line(value: number | null, options: PlotOptions<'line'>): void
  /** 输出柱状图值。 */
  Histogram(value: number | null, options: PlotOptions<'histogram'>): void
  /** 输出散点。 */
  Point(value: number | null, options: PlotOptions<'points'>): void
  /** 输出形状标记；false 留空，absolute 定位时数值为价格。 */
  Shape(value: number | boolean | null, options: PlotOptions<'shape'>): void
  /** 输出字符标记；false 留空，absolute 定位时数值为价格。 */
  Char(value: number | boolean | null, options: PlotOptions<'char'>): void
  /** 输出数值箭头，正负决定方向，绝对值决定长度。 */
  Arrow(value: number | null, options: PlotOptions<'arrow'>): void
}

/** 完整脚本的声明与逐 bar 执行回调。 */
export interface ScriptIndicatorDeclaration extends QuickJSScriptDefinition {
  /** 逐根 K 线调用一次 */
  onBar(): void
}
