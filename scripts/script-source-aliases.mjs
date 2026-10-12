/** 按 Script 包 exports 生成开发源码映射，避免依赖 dist 或过期的 Vite 包缓存。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

// 将包的公开入口映射到源码，子路径与发布声明保持一致。
export function createScriptSourceAliases(scriptSrc) {
  const pkg = JSON.parse(readFileSync(path.resolve(scriptSrc, '..', 'package.json'), 'utf8'))
  return Object.entries(pkg.exports).map(([key, value]) => {
    const specifier = key === '.' ? pkg.name : `${pkg.name}${key.slice(1)}`
    return {
      find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      replacement: path.resolve(
        scriptSrc,
        value.import.replace('./dist/', '').replace(/\.js$/, '.ts'),
      ),
    }
  })
}
