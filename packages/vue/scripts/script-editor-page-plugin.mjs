/** 为独立编辑器生成页面资源，基础编辑器与按需语言服务分别加载。 */
import { fileURLToPath } from 'node:url'
import babel from 'vite-plugin-babel'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { build } from 'vite'
import { createCoreSourceAliases } from '../../../scripts/core-source-aliases.mjs'
import {
  collectWorkspaceSourceDirs,
  createWorkspaceSourceAliases,
} from '../../../scripts/package-source-aliases.mjs'
import { contractResourcesPlugin } from '../../script/scripts/contract-resources-plugin.mjs'

const moduleId = 'virtual:klinechart-script-editor-page'
const resolvedId = `\0${moduleId}`
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const coreSourceRoot = fileURLToPath(new URL('../../core/src/', import.meta.url))
// 编辑器页面横跨 vue/core/script 多个包，监听范围与源码 alias 必须覆盖同一组 workspace 源码根。
const watchedSourceRoots = collectWorkspaceSourceDirs(repoRoot).map((root) =>
  root.replaceAll('\\', '/'),
)
const entry = fileURLToPath(
  new URL('../src/composables/chart/scriptEditor/impl/detachedEditor.ts', import.meta.url),
)

/** core 源码使用 TC39 decorators，嵌套构建同样需要宿主配置里的 Babel 转换。 */
const decoratorTransform = babel({
  include: [/\/src\/.*\.tsx?$/],
  exclude: [/node_modules/],
  babelConfig: {
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [
      ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
      ['@babel/plugin-transform-typescript'],
    ],
  },
})

/**
 * 生成嵌套构建的源码解析表：`@vue-src/` 指向本包源码，其余 workspace 包按各自
 * exports 指向源码。只写死本包路径，新增包或新增子路径出口自动纳入，不会退回缺失的 dist。
 * @returns {Array<{ find: RegExp | string, replacement: string }>}
 */
function createSourceAliases() {
  return [
    { find: /^@vue-src\//, replacement: sourceRoot },
    ...createCoreSourceAliases(coreSourceRoot),
    ...createWorkspaceSourceAliases(repoRoot, { exclude: [coreSourceRoot, sourceRoot] }),
  ]
}

/** 构建独立模块图；保留语言服务的动态导入，使首屏不等待 LSP 下载和解析。 */
export async function buildScriptEditorPage() {
  const result = await build({
    configFile: false,
    root: packageRoot,
    logLevel: 'warn',
    plugins: [contractResourcesPlugin(), decoratorTransform, vue(), Icons({ compiler: 'vue3' })],
    resolve: {
      // 嵌套构建必须解析当前源码，不能把旧 dist 中的声明再次封装进页面。
      alias: createSourceAliases(),
    },
    worker: { format: 'es' },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      target: 'esnext',
      cssCodeSplit: false,
      lib: { entry, formats: ['es'] },
      rolldownOptions: {
        output: {
          entryFileNames: 'editor-[hash].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash][extname]',
        },
      },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  let script
  const styles = []
  const files = []
  for (const output of outputs) {
    for (const asset of output.output) {
      files.push({
        name: asset.fileName,
        source: asset.type === 'chunk' ? asset.code : asset.source,
      })
      if (asset.type === 'chunk' && asset.isEntry) script = asset.fileName
      else if (asset.fileName.endsWith('.css')) styles.push(asset.fileName)
    }
  }
  if (!script) throw new Error('独立脚本编辑器构建没有生成入口')
  return { script, styles, files }
}

/** 页面资源随库发布；开发服务器直接提供同一模块图，宿主无需额外配置路由。 */
export function scriptEditorPagePlugin() {
  let bundle
  let devServer
  const devFiles = new Map()
  const resourcePath = '__klinechart-script-editor/'
  return {
    name: 'klinechart:script-editor-page',
    configureServer(server) {
      devServer = server
      server.watcher.add(watchedSourceRoots)
      server.middlewares.use(async (request, response, next) => {
        const prefix = `${server.config.base}${resourcePath}`
        if (!request.url?.startsWith(prefix)) return next()
        const name = request.url.slice(prefix.length).split('?')[0]
        const source = devFiles.get(name)
        if (source === undefined) return next()
        response.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript')
        response.end(source)
      })
    },
    handleHotUpdate(context) {
      const filename = context.file.replaceAll('\\', '/')
      if (!watchedSourceRoots.some((root) => filename.startsWith(root))) return
      bundle = undefined
      const module = context.server.moduleGraph.getModuleById(resolvedId)
      if (module) return [...context.modules, module]
    },
    resolveId(id) {
      if (id === moduleId) return resolvedId
    },
    async load(id) {
      if (id !== resolvedId) return
      bundle ??= buildScriptEditorPage()
      const page = await bundle
      const urls = new Map()
      for (const file of page.files) {
        if (devServer) {
          devFiles.set(file.name, file.source)
          urls.set(file.name, JSON.stringify(`${devServer.config.base}${resourcePath}${file.name}`))
        } else {
          const reference = this.emitFile({
            type: 'asset',
            fileName: `assets/script-editor/${file.name}`,
            source: file.source,
          })
          urls.set(file.name, `import.meta.ROLLUP_FILE_URL_${reference}`)
        }
      }
      return `export default {script: ${urls.get(page.script)}, styles: [${page.styles.map((name) => urls.get(name)).join(',')}]}`
    },
  }
}
