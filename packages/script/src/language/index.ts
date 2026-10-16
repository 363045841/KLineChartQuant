/** 编译器和编辑器共享的脚本语义入口。 */

export { createScriptLanguageSession } from './impl/createScriptLanguageSession.js'
export { currentValueType } from './impl/currentValueType.js'
export { SCRIPT_SOURCE_FILE } from './impl/scriptFiles.js'
export type {
  ScriptConversion,
  ScriptInsertion,
  ScriptLanguageSession,
  ScriptValueRead,
} from './types.js'
