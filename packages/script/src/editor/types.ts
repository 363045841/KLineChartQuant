/** 编辑器中的脚本全局契约；复用执行器、行情序列与绘图声明的公开类型。 */
import type { QuickJSScriptDefinition } from '../quickjs/types.js'

/** 完整脚本的声明与逐 bar 执行回调。 */
export interface ScriptIndicatorDeclaration extends QuickJSScriptDefinition {
  onBar(): void
}
