/** 分开报告产品总量和基础入口的静态下载量，不把 npm 安装量当作首屏体积。 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
/** 收集构建产物。 */
function filesAt(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesAt(file) : [file]
  })
}
const initial = new Set()
/** 只追踪静态模块引用，动态功能不计入基础入口。 */
function visit(file) {
  if (initial.has(file)) return
  initial.add(file)
  const source = readFileSync(file, 'utf8')
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest)
  for (const statement of syntax.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue
    const specifier = statement.moduleSpecifier
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      visit(path.resolve(path.dirname(file), specifier.text))
    }
  }
}
visit(path.join(dist, 'index.js'))
const all = filesAt(dist)
const css = all.filter((file) => file.endsWith('.css') && !file.includes(`${path.sep}assets${path.sep}`))
const report = {
  unpackedBytes: all.reduce((total, file) => total + statSync(file).size, 0),
  baseJavaScriptGzipBytes: [...initial].reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0),
  stylesheetGzipBytes: css.reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0),
  note: '基础入口不含外部 Vue；默认开启 Agent 和内置脚本时会额外加载相关分块及 Worker。',
}
console.log(JSON.stringify(report, null, 2))
