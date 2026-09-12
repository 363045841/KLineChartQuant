/**
 * pdf-export.mjs
 *
 * 文本/Markdown 导出管线：git 列出文件 → 合并 → 无头 Chrome/Edge 渲染 PDF → 保留首尾 N 页。
 * 供 code-to-pdf / docs-to-pdf 复用，避免重复实现收集、渲染与切页逻辑。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import MarkdownIt from 'markdown-it'
import { PDFDocument } from 'pdf-lib'

/** 参与导出的文本类文件扩展名。 */
export const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.json',
  '.jsonc',
  '.md',
  '.markdown',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.yml',
  '.yaml',
  '.toml',
  '.ps1',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.rb',
  '.sql',
  '.graphql',
  '.gql',
  '.txt',
])

/** 需要按 Markdown 解析的文件扩展名。 */
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

/** 即使不带扩展名也需要导出的文件名。 */
const TEXT_FILENAMES = new Set(['Dockerfile', 'Makefile'])

/** 单个文件大小上限，超过视为压缩产物或数据文件而跳过。 */
const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Chrome/Edge 的可执行文件候选路径，按优先级排列。 */
const BROWSER_CANDIDATES = [
  path.join(process.env.ProgramFiles ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.ProgramFiles ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
]

const markdown = new MarkdownIt({ html: true, linkify: true })

/** 解析命令行参数，返回 { pages, outDir }；--out 相对 root 解析。 */
export function parseArgs(argv, root, defaultOutDir) {
  let pages = 30
  let outDir = defaultOutDir
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--pages') pages = Number(argv[++i])
    else if (arg === '--out') outDir = path.resolve(root, argv[++i])
  }
  if (!Number.isInteger(pages) || pages <= 0) throw new Error('--pages 必须为正整数')
  return { pages, outDir }
}

/** 用 git 列出所有未被忽略的文件（含未跟踪），返回相对仓库根的路径。 */
export function listProjectFiles(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return output.split('\0').filter(Boolean)
}

/** 判断文件是否属于需要导出的文本文件。 */
export function isTextFile(relativePath) {
  const base = path.basename(relativePath)
  if (TEXT_FILENAMES.has(base)) return true
  if (base.endsWith('.min.js') || base.endsWith('.min.css')) return false
  return TEXT_EXTENSIONS.has(path.extname(base).toLowerCase())
}

/** 读取给定文件内容，返回 [{ rel, content }]，跳过缺失或过大的文件。 */
function readSections(root, relPaths) {
  const sections = []
  for (const rel of [...relPaths].sort()) {
    const abs = path.join(root, rel)
    const stat = fs.statSync(abs, { throwIfNoEntry: false })
    if (!stat || !stat.isFile() || stat.size > MAX_FILE_BYTES) continue
    sections.push({ rel: rel.replaceAll('\\', '/'), content: fs.readFileSync(abs, 'utf8') })
  }
  return sections
}

/** 转义 HTML 特殊字符，避免内容破坏标签结构。 */
function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** 生成 txt：以分隔条拼接所有文件原文。 */
function buildText(sections) {
  const bar = '='.repeat(80)
  return sections.map(({ rel, content }) => `${bar}\nFILE: ${rel}\n${bar}\n${content}\n`).join('\n')
}

/** 生成 HTML：Markdown 渲染为标签，其余以 <pre> 保留原文。 */
function buildHtml(sections, format) {
  const body = sections
    .map(({ rel, content }) => {
      const isMarkdown = format === 'markdown' && MARKDOWN_EXTENSIONS.has(path.extname(rel).toLowerCase())
      const rendered = isMarkdown ? markdown.render(content) : `<pre>${escapeHtml(content)}</pre>`
      return `<section class="doc"><div class="doc-path">${escapeHtml(rel)}</div>${rendered}</section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 14mm; }
  html, body { margin: 0; }
  body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; color: #1a1a1a; }
  .doc { break-before: page; }
  .doc:first-of-type { break-before: auto; }
  .doc-path {
    font-family: Consolas, 'Microsoft YaHei', monospace;
    font-size: 8pt; color: #888; border-bottom: 1px solid #eee;
    margin: 0 0 10px; padding-bottom: 4px;
  }
  h1 { font-size: 19pt; margin: 16px 0 10px; }
  h2 { font-size: 15pt; margin: 14px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 3px; }
  h3 { font-size: 13pt; margin: 12px 0 6px; }
  h4, h5, h6 { font-size: 11pt; margin: 10px 0 6px; }
  p, li { font-size: 10pt; line-height: 1.6; }
  a { color: #0366d6; text-decoration: none; }
  code {
    font-family: Consolas, 'Microsoft YaHei', monospace; font-size: 9pt;
    background: #f4f4f4; padding: 1px 3px; border-radius: 3px;
  }
  pre {
    background: #f6f8fa; padding: 8px 10px; border-radius: 4px;
    white-space: pre-wrap; overflow-wrap: anywhere; font-size: 8.5pt; line-height: 1.4;
  }
  pre code { background: none; padding: 0; }
  blockquote { margin: 8px 0; padding: 2px 12px; border-left: 4px solid #d0d7de; color: #57606a; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9pt; }
  th, td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #d0d7de; }
</style>
</head>
<body>${body}</body>
</html>
`
}

/** 查找可用的 Chrome/Edge 可执行文件路径。 */
function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }
  const found = BROWSER_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate))
  if (!found) throw new Error('未找到 Chrome 或 Edge，可通过 CHROME_PATH 环境变量指定')
  return found
}

/** 调用浏览器无头模式将 HTML 渲染为 PDF。 */
function renderPdf(browserPath, htmlPath, pdfPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-export-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--no-first-run',
    `--user-data-dir=${userDataDir}`,
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ]
  try {
    const result = spawnSync(browserPath, args, { stdio: 'ignore', timeout: 10 * 60 * 1000 })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`浏览器渲染失败，退出码 ${result.status}`)
    if (!fs.existsSync(pdfPath)) throw new Error('浏览器未生成 PDF 文件')
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

/** 只保留前 pages 页与后 pages 页，生成新的 PDF。返回总页数与保留页数。 */
async function slicePdf(pdfPath, slicedPath, pages) {
  const src = await PDFDocument.load(fs.readFileSync(pdfPath))
  const total = src.getPageCount()
  const kept = new Set()
  for (let i = 0; i < Math.min(pages, total); i++) kept.add(i)
  for (let i = Math.max(0, total - pages); i < total; i++) kept.add(i)
  const indices = [...kept].sort((a, b) => a - b)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, indices)
  copied.forEach((page) => out.addPage(page))
  fs.writeFileSync(slicedPath, await out.save())
  return { total, kept: indices.length }
}

/**
 * 执行完整导出：读取文件、渲染 PDF、切出首尾页。
 * format 为 'markdown' 时按 Markdown 解析，否则按纯文本保留。
 */
export async function exportPdf({ root, outDir, name, relPaths, pages, format = 'text' }) {
  fs.mkdirSync(outDir, { recursive: true })
  const sections = readSections(root, relPaths)
  const text = buildText(sections)
  const txtPath = path.join(outDir, `${name}.txt`)
  const htmlPath = path.join(outDir, `${name}.html`)
  const pdfPath = path.join(outDir, `${name}.pdf`)
  const slicedPath = path.join(outDir, `${name}-first-last-${pages}.pdf`)

  fs.writeFileSync(txtPath, text, 'utf8')
  fs.writeFileSync(htmlPath, buildHtml(sections, format), 'utf8')
  console.log(
    `已收集 ${sections.length} 个文件，共 ${(text.length / 1024 / 1024).toFixed(2)} MB → ${txtPath}`,
  )

  renderPdf(findBrowser(), htmlPath, pdfPath)
  const { total, kept } = await slicePdf(pdfPath, slicedPath, pages)

  console.log(`完整 PDF：${pdfPath}（${total} 页）`)
  console.log(`切页 PDF：${slicedPath}（${kept} 页 = 前 ${pages} + 后 ${pages}）`)
}
