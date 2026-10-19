/**
 * klinechart-script-server 公共入口。
 *
 * 只导出脚本编辑器所需的 TypeScript 语言服务与类型契约；图表包通过动态 import
 * 加载本模块，未安装本包时编辑器退化为无补全的纯文本编辑器。
 */

export { createScriptLanguageSupport } from './languageSupport.js'
export { SCRIPT_EDITOR_FILE } from './types.js'
export type {
  ScriptCodeView,
  ScriptLanguageWorker,
  ScriptSignatureHelp,
  ScriptSignatureProvider,
  ScriptTextRange,
} from './types.js'
