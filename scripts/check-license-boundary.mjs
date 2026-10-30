/**
 * check-license-boundary.mjs
 *
 * 许可证边界守卫：Apache-2.0 的包不得 import 或打包 AGPL 的 script 系列包。
 * 唯一允许的方向是 AGPL 包引用 Apache 包，以及图表包可选地动态加载
 * klinechart-script-server（AGPL，未安装时编辑器退化为纯文本）。
 *
 * 例外只给「只读元数据做展示」的文件：开源致谢把包名当数据列出来，不构成引用关系。
 *
 * 用法：node scripts/check-license-boundary.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Apache-2.0 一侧的包：发布物里不允许出现任何 AGPL module specifier。 */
const APACHE_PACKAGES = ['plot-contracts', 'core', 'agent-runtime', 'react', 'angular']

/**
 * 豁免文件（相对仓库根，正斜杠）：只把 AGPL 包名当展示文本读取 package.json，
 * 既不 import 其入口也不打包其代码，因此不计入边界违规。
 */
const DISPLAY_ONLY_FILES = new Set(['packages/vue/src/credits/openSourceCredits.ts'])

/** Apache 包唯一允许引用的 AGPL 包：可选的语言服务与独立编辑器页。 */
const FORBIDDEN_SOURCE = /@363045841yyt\/klinechart-script(?!-(server|editor))/
const FORBIDDEN_BUNDLED =
  /(?:require|import)\(\s*["'`]@363045841yyt\/klinechart-script(?!-(server|editor))/

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.vue'])
const BUNDLE_EXTENSIONS = new Set(['.js', '.cjs'])

/** 递归收集满足条件的文件绝对路径。 */
function collectFiles(dir, extensions, { skipTests = false } = {}) {
  const found = []
  const walk = (current) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || (skipTests && entry.name === '__tests__')) continue
        walk(full)
        continue
      }
      if (extensions.has(path.extname(entry.name))) found.push(full)
    }
  }
  walk(dir)
  return found
}

/** 仓库相对路径统一用正斜杠，豁免清单才能跨平台匹配。 */
function repoPath(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

/** 返回目录下所有命中正则的文件与首个命中行。 */
function scan(files, pattern) {
  const hits = []
  for (const file of files) {
    const relative = repoPath(file)
    if (DISPLAY_ONLY_FILES.has(relative)) continue
    const match = pattern.exec(readFileSync(file, 'utf8'))
    if (match) hits.push({ file: relative, snippet: match[0] })
  }
  return hits
}

/** 检查 Apache 包源码与已构建产物，返回违规清单。 */
function checkPackage(pkg) {
  const dir = path.join(repoRoot, 'packages', pkg)
  if (statSync(dir, { throwIfNoEntry: false }) === undefined) return []
  const violations = []
  const sourceHits = scan(
    collectFiles(path.join(dir, 'src'), SOURCE_EXTENSIONS, { skipTests: true }),
    FORBIDDEN_SOURCE,
  )
  const distHits = scan(
    collectFiles(path.join(dir, 'dist'), BUNDLE_EXTENSIONS).filter(
      (file) => !file.endsWith('.d.ts') && !file.endsWith('.d.cts'),
    ),
    FORBIDDEN_BUNDLED,
  )
  for (const hit of [...sourceHits, ...distHits]) {
    violations.push(`  ${hit.file}: ${hit.snippet}`)
  }
  return violations
}

const failures = []
for (const pkg of APACHE_PACKAGES) {
  const violations = checkPackage(pkg)
  if (violations.length > 0) failures.push(`packages/${pkg}`.concat('\n', violations.join('\n')))
}

if (failures.length > 0) {
  console.error('[license-boundary] Apache 包引用了 AGPL 的 script 系列包：')
  console.error(failures.join('\n\n'))
  process.exit(1)
}

console.log('[license-boundary] 通过：Apache 包未引用或打包 AGPL 的 script 系列包。')
