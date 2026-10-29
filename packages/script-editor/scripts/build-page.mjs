/**
 * 构建独立编辑器页。
 *
 * 与普通库构建的区别只有交付形态：这份产物要在一个空白窗口里直接运行，
 * 所以把 vue 的编辑器组件、CodeMirror 与语言服务全部打进来，运行期不再解析模块图。
 *
 * 用法：node scripts/build-page.mjs   （产物写入 dist/assets）
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { build } from 'vite'
import babel from 'vite-plugin-babel'
import { createCoreSourceAliases } from '../../../scripts/core-source-aliases.mjs'
import { createWorkspaceSourceAliases } from '../../../scripts/package-source-aliases.mjs'
import { contractResourcesPlugin } from '../../script/scripts/contract-resources-plugin.mjs'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const vueSourceRoot = fileURLToPath(new URL('../../vue/src/', import.meta.url))
const coreSourceRoot = fileURLToPath(new URL('../../core/src/', import.meta.url))
const entry = fileURLToPath(new URL('../src/page/editor.ts', import.meta.url))

/** 页面脚本与样式的固定文件名；src/index.ts 的运行时约定必须与此一致。 */
const PAGE_SCRIPT = 'editor.js'
const PAGE_STYLE = 'editor.css'

/** core 源码使用 TC39 decorators，嵌套构建同样需要 Babel 转换。 */
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
 * 嵌套构建的源码 alias：优先解析到 workspace 源码，避免把已经 dist 的产物再封装一层。
 * @returns {Array<{ find: RegExp | string, replacement: string }>}
 */
function createSourceAliases() {
  return [
    { find: /^@vue-src\//, replacement: vueSourceRoot },
    ...createCoreSourceAliases(coreSourceRoot),
    ...createWorkspaceSourceAliases(repoRoot, { exclude: [coreSourceRoot, vueSourceRoot] }),
  ]
}

/**
 * 构建页面产物。
 *
 * 页面必须是「入口 + 样式」两个文件：宿主用 `new URL('./assets/editor.js', import.meta.url)`
 * 复制资源时只会复制这一个文件，不会跟随它的相对 import。所以这里把 chunk 与 Worker 全部内联。
 *
 * @returns {Promise<{ script: string, styles: string[], files: Array<{ name: string, source: string | Uint8Array }> }>}
 */
export async function buildEditorPage() {
  const result = await build({
    base: './',
    configFile: false,
    root: packageRoot,
    logLevel: 'warn',
    plugins: [
      contractResourcesPlugin(),
      // Worker 必须以 base64 内联：宿主只复制 editor.js 这一个文件，不会跟随相对资源。
      {
        name: 'inline-worker',
        enforce: 'pre',
        async resolveId(source, importer) {
          if (!source.endsWith('?worker')) return null
          return this.resolve(`${source}&inline`, importer, { skipSelf: true })
        },
      },
      decoratorTransform,
      vue(),
      Icons({ compiler: 'vue3' }),
    ],
    resolve: { alias: createSourceAliases() },
    worker: { format: 'es' },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      target: 'esnext',
      cssCodeSplit: false,
      lib: { entry, formats: ['es'] },
      rolldownOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: PAGE_SCRIPT,
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: (asset) => {
            const name = asset.names?.[0] ?? asset.name ?? ''
            return name.endsWith('.css') ? PAGE_STYLE : '[name]-[hash][extname]'
          },
        },
      },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const files = []
  const styles = []
  let script
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
  if (script !== PAGE_SCRIPT) throw new Error(`页面入口没有产出 ${PAGE_SCRIPT}`)
  if (!styles.includes(PAGE_STYLE)) throw new Error(`页面样式没有产出 ${PAGE_STYLE}`)
  return { script, styles, files }
}

/** 写入 dist/assets；src/index.ts 按固定相对路径引用这些文件。 */
async function writeEditorPage() {
  const page = await buildEditorPage()
  const outDir = path.join(packageRoot, 'dist/assets')
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  for (const file of page.files) {
    const target = path.join(outDir, file.name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, file.source)
  }
  console.log(`[script-editor] 已写出 ${page.files.length} 个文件到 dist/assets`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeEditorPage()
}
