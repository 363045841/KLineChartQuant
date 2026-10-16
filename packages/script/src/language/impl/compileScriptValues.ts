/** 执行器复用共享语义会话；逐 bar 执行不参与类型分析。进程内保存唯一会话，重复编译沿用同一增量程序。 */
import type { ScriptLanguageSession } from '../types.js'
import { createScriptLanguageSession } from './createScriptLanguageSession.js'

let session: ScriptLanguageSession | undefined

/** 首次编译才初始化会话，后续源码版本使用同一条增量更新流程。 */
export function compileScriptValues(source: string): string {
  session ??= createScriptLanguageSession()
  return session.updateSource(source).code
}
