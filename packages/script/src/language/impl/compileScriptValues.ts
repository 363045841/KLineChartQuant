/** 执行器复用共享语义会话；逐 bar 执行不参与类型分析。进程内保存唯一会话，重复编译沿用同一增量程序。 */
import type { ScriptLanguageSession } from '../types.js'
import { createScriptLanguageSession } from './createScriptLanguageSession.js'
import type { QuickJSLibrary } from '../../quickjs/types.js'
import ts from 'typescript'
import { SCRIPT_SOURCE_FILE } from './scriptFiles.js'
import { inspectScript } from './scriptLibraries.js'

let session: ScriptLanguageSession | undefined

/** 首次编译才初始化会话，后续源码版本使用同一条增量更新流程。 */
export function compileScriptValues(source: string, libraries: readonly QuickJSLibrary[] = []): string {
  session ??= createScriptLanguageSession()
  session.setLibraries(libraries)
  const code = session.updateSource(source).code
  // 显式跨文件引用必须检查公开类型，否则库删掉成员后仍可能保存成功。
  if (libraries.length && inspectScript(source).dependencies.some((name) => name !== 'ta')) {
    const diagnostics = session.environment.languageService.getSemanticDiagnostics(SCRIPT_SOURCE_FILE)
    if (diagnostics.length) throw new Error(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'))
  }
  return code
}
