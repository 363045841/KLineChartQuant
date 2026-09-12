/**
 * code-to-pdf.mjs
 *
 * 将项目所有代码文本导出为单个 txt，渲染为 PDF，并只保留前 N 页与后 N 页。
 *
 * 用法：
 *   node scripts/code-to-pdf.mjs              # 默认前 30 页 + 后 30 页
 *   node scripts/code-to-pdf.mjs --pages 20   # 自定义页数
 *   node scripts/code-to-pdf.mjs --out .code-pdf
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportPdf, isTextFile, listProjectFiles, parseArgs } from './lib/pdf-export.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

/** 入口：收集代码文本并导出 PDF。 */
async function main() {
  const { pages, outDir } = parseArgs(
    process.argv.slice(2),
    ROOT,
    path.join(ROOT, '.code-pdf'),
  )
  const relPaths = listProjectFiles(ROOT).filter(isTextFile)
  await exportPdf({ root: ROOT, outDir, name: 'all-code', relPaths, pages })
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
