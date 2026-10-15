/** TypeScript 脚本的唯一编译入口，QuickJS 只接收去除类型后的全局脚本。 */
import ts from 'typescript'
import { ScriptExecutionError } from '../../errors.js'

/** 编译完整 TS 文件；模块语法不属于沙箱的全局脚本契约。 */
export function compileScript(source: string): string {
  const file = ts.createSourceFile('indicator.ts', source, ts.ScriptTarget.ES2022, true)
  if (ts.isExternalModule(file)) {
    throw new ScriptExecutionError('compile', '脚本不能使用 import/export，请使用全局脚本 API')
  }
  const result = ts.transpileModule(source, {
    fileName: 'indicator.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
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
