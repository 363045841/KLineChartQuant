/**
 * core-source-aliases.mjs
 *
 * 从 @363045841yyt/klinechart-core 的 package.json exports 生成 Vite/Vitest alias，
 * 把发布子路径映射到 packages/core/src，避免各 config 手写列表与 exports 漂移。
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CORE_PACKAGE = '@363045841yyt/klinechart-core'

/**
 * 转义字符串以便嵌入正则，保证 alias 按完整 specifier 精确匹配。
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 读取 export 目标的 ESM import 路径。
 * @param {unknown} value
 * @returns {string | null}
 */
function getImportPath(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.import === 'string') {
    return value.import
  }
  return null
}

/**
 * 按 core package.json exports 生成源码 alias。
 * 每条 export 使用精确正则，避免 `Indicator` 前缀误伤 `Indicator/indicatorCatalog`。
 * @param {string} coreSrc packages/core/src 的绝对路径
 * @returns {Array<{ find: RegExp, replacement: string }>}
 */
export function createCoreSourceAliases(coreSrc) {
  const pkgPath = path.resolve(coreSrc, '..', 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(`[core-source-aliases] 找不到 core package.json：${pkgPath}`)
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  if (!pkg.exports || typeof pkg.exports !== 'object') {
    throw new Error(`[core-source-aliases] ${pkgPath} 缺少 exports`)
  }

  /** @type {Array<{ find: RegExp, replacement: string }>} */
  const aliases = []

  for (const [key, value] of Object.entries(pkg.exports)) {
    const importPath = getImportPath(value)
    if (!importPath) {
      throw new Error(`[core-source-aliases] export "${key}" 没有 import 目标`)
    }

    const sourcePath = importPath.replace('./dist/', '').replace(/\.js$/, '.ts')
    const sourceFile = `${coreSrc}/${sourcePath}`
    if (!existsSync(sourceFile)) {
      throw new Error(
        `[core-source-aliases] export "${key}" 映射的源文件不存在：${sourceFile}`,
      )
    }

    const specifier = key === '.' ? CORE_PACKAGE : `${CORE_PACKAGE}${key.slice(1)}`
    aliases.push({
      find: new RegExp(`^${escapeRegExp(specifier)}$`),
      replacement: sourceFile,
    })
  }

  // exports 未覆盖的 Indicator 深层文件（如单个指标模块）仍走源码目录
  aliases.push({
    find: new RegExp(`^${escapeRegExp(`${CORE_PACKAGE}/engine/renderers/Indicator`)}(/.+)$`),
    replacement: `${coreSrc}/engine/renderers/Indicator$1`,
  })

  return aliases
}
