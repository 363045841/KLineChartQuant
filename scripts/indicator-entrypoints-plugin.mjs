/** 在 Vite/Vitest 启动和源码增删时自动生成 @Indicator 装配入口。 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { reloadAfter, watchFiles } from '../packages/script/scripts/lib/vite-watch.mjs'
import {
  CORE_SOURCE_ROOT,
  generateIndicatorEntrypoints,
} from './generate-indicator-entrypoints.mjs'

/** 创建开发与生产共用的生成插件；开发目录变更后重载以清除旧定义。
 * @returns {import('vite').Plugin}
 */
export function indicatorEntrypointsPlugin(sourceRoot = CORE_SOURCE_ROOT) {
  let definitionFiles = new Set()
  /** 重新发现定义并更新生成文件；任何扫描错误阻止本次构建。 */
  function generate() {
    const result = generateIndicatorEntrypoints(sourceRoot)
    definitionFiles = new Set(
      result.definitions.map((definition) => path.resolve(definition.filename)),
    )
    return result.changed
  }
  return {
    name: 'klinechart:indicator-entrypoints',
    enforce: 'pre',
    buildStart() {
      generate()
    },
    configureServer(server) {
      generate()
      server.watcher.add(sourceRoot)
      /** 新增、改名、删除定义后生成入口并重载，避免全局目录残留旧注册。 */
      async function refresh(filename) {
        const resolved = path.resolve(filename)
        const relative = path.relative(sourceRoot, resolved)
        if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.tsx?$/.test(relative))
          return
        if (
          relative
            .split(path.sep)
            .some((part) => ['__tests__', '__fixtures__', 'generated'].includes(part))
        )
          return
        const relevant =
          definitionFiles.has(resolved) ||
          (existsSync(resolved) && readFileSync(resolved, 'utf8').includes('Indicator'))
        if (!relevant) return
        await reloadAfter(server, generate)
      }
      watchFiles(server, (filename) => void refresh(filename))
    },
  }
}
