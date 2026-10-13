/** 把 VM 运行时源码编译成字符串，替代手写模板字符串并让编译期检查生效。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'

const packageRoot = new URL('../', import.meta.url)
const outputFile = new URL('src/quickjs/generated/runtime.ts', packageRoot)

/** 运行时源文件与生成导出名的对应；顺序即 VM 内的加载顺序。 */
const entries = [
  { file: 'library.ts', exportName: 'LIBRARY_PRELUDE' },
  { file: 'series.ts', exportName: 'SCRIPT_PRELUDE' },
  { file: 'plotKind.ts', exportName: 'PLOT_KIND_PRELUDE' },
  { file: 'indicator.ts', exportName: 'INDICATOR_PRELUDE' },
  { file: 'ta.ts', exportName: 'TA_LIBRARY_SOURCE' },
]

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  removeComments: false,
}

/**
 * 编译单个运行时文件。
 * @param fileName 源文件名，用于诊断信息。
 * @param source 运行时 TypeScript 源码。
 * @returns 去掉类型后的 VM 可执行源码。
 */
function compile(fileName, source) {
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions,
    fileName,
    reportDiagnostics: true,
  })
  const failures = (diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  if (failures.length > 0) {
    const messages = failures.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' '))
    throw new Error(`${fileName} 编译失败：${messages.join('；')}`)
  }
  // 残留模块语法说明源码被当成了模块，全局声明会失效，注入 VM 后必然报错。
  if (/(^|\n)\s*(import|export)[\s({]/.test(outputText)) {
    throw new Error(`${fileName} 含 import/export，VM 脚本不能作为模块加载`)
  }
  return outputText
}

const declarations = []
for (const entry of entries) {
  const source = await readFile(new URL(`src/quickjs/runtime/${entry.file}`, packageRoot), 'utf8')
  declarations.push(
    `export const ${entry.exportName} = ${JSON.stringify(compile(entry.file, source))}`,
  )
}

await mkdir(new URL('src/quickjs/generated/', packageRoot), { recursive: true })
await writeFile(
  outputFile,
  `/** 自动生成的 VM 运行时源码；修改 src/quickjs/runtime/ 后运行 Script build，禁止手工编辑。 */\n` +
    `// biome-ignore-all format: 运行时源码由生成器统一序列化\n` +
    `${declarations.join('\n')}\n`,
)
