/**
 * 契约生成物的开发期插件：监听绘图契约与脚本站内声明，变更后按依赖顺序重生成
 * 全局枚举、VM 运行时与编辑器类型资源，并触发整页重载。
 *
 * 生成物本身也位于被监听的源码目录内，必须显式排除，否则写盘会再次触发监听。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateEditorResources } from './generate-editor-resources.mjs'
import { generateRuntimeSources } from './generate-runtime-sources.mjs'
import { generateScriptEnums } from './generate-script-enums.mjs'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(scriptRoot, '../..')

/** 影响生成物的输入；任一变更都重跑全部生成器，顺序即依赖顺序。 */
const INPUT_ROOTS = [
  path.join(scriptRoot, 'src/contracts'),
  path.join(scriptRoot, 'src/Library'),
  path.join(scriptRoot, 'src/series'),
  path.join(scriptRoot, 'src/editor'),
  path.join(scriptRoot, 'src/quickjs/runtime'),
  path.join(scriptRoot, 'scripts'),
  path.join(repoRoot, 'packages/plot-contracts/src'),
]

/** 生成物路径；写盘会再次触发 watcher，排除以免自激。 */
const OUTPUT_FILES = new Set([
  path.join(scriptRoot, 'src/editor/resources.ts'),
  path.join(scriptRoot, 'src/quickjs/generated/runtime.ts'),
  path.join(scriptRoot, 'src/quickjs/generated/builtinScripts.ts'),
  path.join(scriptRoot, 'src/quickjs/runtime/plotKind.ts'),
])

/** 判断变更文件是否属于生成物输入。 */
function isInput(filename) {
  const resolved = path.resolve(filename)
  if (OUTPUT_FILES.has(resolved)) return false
  return INPUT_ROOTS.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}

/** 按依赖顺序重生成全部产物；枚举先行，编辑器资源最后读取最新枚举。 */
async function regenerate() {
  const results = [
    await generateScriptEnums(),
    await generateRuntimeSources(),
    await generateEditorResources(),
  ]
  return results.some((result) => result.changed)
}

/**
 * 创建契约生成物插件；开发启动时生成一次，契约变更后重生成并按需重载。
 * @returns {import('vite').Plugin}
 */
export function contractResourcesPlugin() {
  // 生成器自身写盘会再次触发监听，运行期间忽略新事件。
  let running = false
  return {
    name: 'klinechart:contract-resources',
    enforce: 'pre',
    async buildStart() {
      await regenerate()
    },
    configureServer(server) {
      server.watcher.add(INPUT_ROOTS)
      /** 契约变更后重生成；仅在有实际写入时重载，避免空转。 */
      async function refresh(filename) {
        if (running || !isInput(filename)) return
        running = true
        try {
          if (await regenerate()) server.ws.send({ type: 'full-reload' })
        } catch (error) {
          server.config.logger.error(String(error))
          server.ws.send({ type: 'error', err: { message: String(error), stack: '' } })
        } finally {
          running = false
        }
      }
      const handler = (filename) => void refresh(filename)
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, handler)
      server.httpServer?.once('close', () => {
        for (const event of ['add', 'change', 'unlink']) server.watcher.off(event, handler)
      })
    },
  }
}
