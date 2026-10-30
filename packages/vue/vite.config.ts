/** 唯一 Vue 产品构建：内部代码随产品交付，Vue 保持宿主 peer。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { defineConfig, type Plugin } from 'vite'
import dts from 'vite-plugin-dts'

/** 独立编辑器是自包含页面，作为文件发布而非内联进主入口。 */
function editorPageAssets(): Plugin {
  return {
    name: 'klinechart:product-editor-assets',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@363045841yyt/klinechart-script-editor') return '\0product-editor-assets'
    },
    load(id) {
      if (id !== '\0product-editor-assets') return
      const refs = ['editor.js', 'editor.css'].map((name) => this.emitFile({
        type: 'asset',
        fileName: `assets/${name}`,
        source: readFileSync(fileURLToPath(new URL(`../script-editor/dist/assets/${name}`, import.meta.url))),
      }))
      return `export async function loadScriptEditorPageAssets() { return { script: import.meta.ROLLUP_FILE_URL_${refs[0]}, styles: [import.meta.ROLLUP_FILE_URL_${refs[1]}] } }`
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    editorPageAssets(),
    vue(),
    Icons({ compiler: 'vue3', autoInstall: false }),
    dts({ tsconfigPath: fileURLToPath(new URL('./tsconfig.build.json', import.meta.url)) }),
  ],
  resolve: {
    alias: [{ find: /^@vue-src\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }],
  },
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    emptyOutDir: true,
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
    cssCodeSplit: true,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        agent: fileURLToPath(new URL('./src/agent.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external: ['vue'],
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
})
