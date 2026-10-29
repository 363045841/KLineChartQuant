/**
 * klinechart-script-server 的公共入口。
 *
 * 只包含脚本编辑器需要的 TypeScript 语言服务与来源改写，图表包通过动态 import
 * 按需加载本模块，未安装时编辑器退化为无补全的纯文本编辑。
 */

export { createScriptLanguageSupport } from './languageSupport.js'
export { rewriteScriptIdentity } from './rewriteScriptIdentity.js'
export type {
  ScriptCodeView,
  ScriptLanguageWorker,
  ScriptSignatureHelp,
  ScriptSignatureProvider,
  ScriptTextRange,
} from './types.js'
export { SCRIPT_EDITOR_FILE } from './types.js'
