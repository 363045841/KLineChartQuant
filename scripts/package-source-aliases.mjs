/**
 * package-source-aliases.mjs
 *
 * 按指定包的 package.json exports 生成开发期源码映射，让 Vite / Electron 预览
 * 直接解析源码而不依赖预先构建的 dist，也避免与发布声明漂移。
 */

import { readFileSync } from 'node:fs'
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
 * 为一个包生成 exports → 源码的 Vite alias 列表。
 * @param {string} pkgSrc 包的 src 目录绝对路径
 * @returns {Array<{ find: RegExp, replacement: string }>}
 */
export function createPackageSourceAliases(pkgSrc) {
  const pkg = JSON.parse(readFileSync(path.resolve(pkgSrc, '..', 'package.json'), 'utf8'))
  const aliases = []
  for (const [key, value] of Object.entries(pkg.exports)) {
    const importPath = typeof value === 'string' ? value : value.import
    // 通配 export 指向一组文件，无法一一映射到单个源文件，跳过。
    if (!importPath || key.includes('*')) continue
    const specifier = key === '.' ? pkg.name : `${pkg.name}${key.slice(1)}`
    aliases.push({
      find: new RegExp(`^${escapeRegExp(specifier)}$`),
      replacement: path.resolve(pkgSrc, importPath.replace('./dist/', '').replace(/\.js$/, '.ts')),
    })
  }
  return aliases
}
