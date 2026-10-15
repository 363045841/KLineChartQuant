/** 编辑器中的脚本全局契约；复用执行器、行情序列与绘图声明的公开类型。 */

import type { PlotCallOptions } from '@363045841yyt/klinechart-plot-contracts'
import type { QuickJSScriptDefinition } from '../quickjs/types.js'

/** 调用处的绘图选项；color 可逐点变化。 */
export type ScriptPlotOptions = PlotCallOptions

/** 完整脚本的声明与逐 bar 执行回调。 */
export interface ScriptIndicatorDeclaration extends QuickJSScriptDefinition {
  /** 逐根 K 线调用一次 */
  onBar(): void
}
