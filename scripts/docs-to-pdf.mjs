/**
 * docs-to-pdf.mjs
 *
 * 将 docs 目录下的文档导出为单个 txt，渲染为 PDF，并只保留前 N 页与后 N 页。
 *
 * 用法：
 *   node scripts/docs-to-pdf.mjs              # 默认前 30 页 + 后 30 页
 *   node scripts/docs-to-pdf.mjs --pages 20   # 自定义页数
 *   node scripts/docs-to-pdf.mjs --out .docs-pdf
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportPdf, isTextFile, listProjectFiles, parseArgs } from './lib/pdf-export.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DOCS_PREFIX = 'docs/'

/** 入口：收集 docs 文档并导出 PDF。 */
async function main() {
  const { pages, outDir } = parseArgs(
    process.argv.slice(2),
    ROOT,
    path.join(ROOT, '.docs-pdf'),
  )
  const relPaths = listProjectFiles(ROOT).filter(
    (rel) => rel.startsWith(DOCS_PREFIX) && isTextFile(rel),
  )
  await exportPdf({ root: ROOT, outDir, name: 'docs', relPaths, pages, format: 'markdown' })
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
