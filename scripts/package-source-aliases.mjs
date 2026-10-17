/**
 * package-source-aliases.mjs
 *
 * 按包 package.json 的 exports 生成开发期源码映射，让 Vite / Electron 预览
 * 直接解析源码而不依赖预先构建的 dist，也避免与发布声明漂移。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * 转义字符串以便嵌入正则，保证 alias 按完整 specifier 精确匹配。
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 读取包目录下的 package.json。
 * @param {string} pkgSrc 包的 src 目录绝对路径
 * @returns {{ name: string, exports?: Record<string, unknown> }}
 */
function readPackage(pkgSrc) {
  return JSON.parse(readFileSync(path.resolve(pkgSrc, '..', 'package.json'), 'utf8'))
}

/**
 * 读取 export 目标的 ESM 路径，兼容 `"./dist/x.js"`、`{ import: "./dist/x.js" }`
 * 与 `{ import: { default: "./dist/x.js" } }` 三种写法；非 JS 目标（如 style.css）返回 null。
 * @param {unknown} value exports 中单个入口的值
 * @returns {string | null}
 */
function getImportPath(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  const target = value.import ?? value.default
  if (typeof target === 'string') return target
  if (!target || typeof target !== 'object') return null
  const nested = target.default ?? target.import
  return typeof nested === 'string' ? nested : null
}

/**
 * 为一个包生成 exports → 源码的 Vite alias 列表。
 * 跳过通配 export、非 JS 目标与未声明 exports 的包（编辑器应用等无 exports 的包返回空列表）。
 * @param {string} pkgSrc 包的 src 目录绝对路径
 * @returns {Array<{ find: RegExp, replacement: string }>}
 */
export function createPackageSourceAliases(pkgSrc) {
  const pkg = readPackage(pkgSrc)
  const exportsMap = pkg.exports
  if (!exportsMap || typeof exportsMap !== 'object') return []
  const aliases = []
  for (const [key, value] of Object.entries(exportsMap)) {
    // 通配 export 指向一组文件，无法一一映射到单个源文件，跳过。
    if (key.includes('*')) continue
    const importPath = getImportPath(value)
    if (!importPath || !importPath.endsWith('.js')) continue
    const specifier = key === '.' ? pkg.name : `${pkg.name}${key.slice(1)}`
    aliases.push({
      find: new RegExp(`^${escapeRegExp(specifier)}$`),
      replacement: path.resolve(pkgSrc, importPath.replace('./dist/', '').replace(/\.js$/, '.ts')),
    })
  }
  return aliases
}

/**
 * 收集 workspace 各包已存在的源码目录 packages/<pkg>/src。
 * @param {string} repoRoot 仓库根目录
 * @returns {string[]}
 */
export function collectWorkspaceSourceDirs(repoRoot) {
  const packagesDir = path.join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return []
  return readdirSync(packagesDir)
    .map((name) => path.join(packagesDir, name, 'src'))
    .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
}

/**
 * 为 workspace 内每个包生成源码 alias：新增包自动纳入，无需在各 config 维护清单。
 * @param {string} repoRoot 仓库根目录
 * @param {{ exclude?: string[] }} [options] exclude 为不参与源码映射的包 src 目录，
 *   供自行控制该包解析目标的 config 显式排除
 * @returns {Array<{ find: RegExp, replacement: string }>}
 */
export function createWorkspaceSourceAliases(repoRoot, { exclude = [] } = {}) {
  const excluded = new Set(exclude.map((dir) => path.resolve(dir)))
  return collectWorkspaceSourceDirs(repoRoot)
    .filter((pkgSrc) => !excluded.has(path.resolve(pkgSrc)))
    .flatMap(createPackageSourceAliases)
}
