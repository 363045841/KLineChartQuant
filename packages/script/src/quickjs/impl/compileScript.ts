/** TypeScript 脚本的唯一编译入口，QuickJS 只接收去除类型后的全局脚本。 */
import ts from 'typescript'
import { ScriptExecutionError } from '../../errors.js'
import { compileScriptValues } from '../../language/impl/compileScriptValues.js'
import { SCRIPT_MODULE_KIND, SCRIPT_TARGET } from '../../language/impl/scriptCompilerOptions.js'
import { SCRIPT_SOURCE_FILE } from '../../language/impl/scriptFiles.js'

/** 编译完整 TS 文件；模块语法不属于沙箱的全局脚本契约。 */
export function compileScript(source: string): string {
  const file = ts.createSourceFile(SCRIPT_SOURCE_FILE, source, SCRIPT_TARGET, true)
  if (ts.isExternalModule(file)) {
    throw new ScriptExecutionError('compile', '脚本不能使用 import/export，请使用全局脚本 API')
  }
  const result = ts.transpileModule(compileScriptValues(source), {
    fileName: SCRIPT_SOURCE_FILE,
    compilerOptions: {
      target: SCRIPT_TARGET,
      module: SCRIPT_MODULE_KIND,
      moduleDetection: ts.ModuleDetectionKind.Legacy,
    },
    reportDiagnostics: true,
  })
  const errors = result.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error)
  if (errors?.length) {
    throw new ScriptExecutionError(
      'compile',
      errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'),
    )
  }
  return result.outputText
}
