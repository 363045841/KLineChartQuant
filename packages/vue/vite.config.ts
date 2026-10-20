import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import Icons from 'unplugin-icons/vite'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'
import { scriptEditorPagePlugin } from './scripts/script-editor-page-plugin.mjs'

const isWC = process.env.BUILD_TARGET === 'web-component'

export default defineConfig({
  plugins: [
    scriptEditorPagePlugin(),
    vue({ customElement: isWC }),
    Icons({ compiler: 'vue3', autoInstall: true }),
    ...(isWC
      ? [cssInjectedByJs({
          // 独立页面的样式必须留在资源目录，由子窗口加载，不能注入宿主后删除。
          cssAssetsFilterFunction: (asset) => !asset.fileName.startsWith('assets/script-editor/'),
        })]
      : [
          dts({
            tsconfigPath: fileURLToPath(new URL('./tsconfig.build.json', import.meta.url)),
          }),
        ]),
  ],

  resolve: {
    alias: [{ find: /^@vue-src\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }],
  },

  build: {
    target: 'esnext',
    emptyOutDir: !isWC,
    cssCodeSplit: !isWC,
    lib: isWC
      ? {
          entry: fileURLToPath(new URL('./src/web-component-with-sources.ts', import.meta.url)),
          name: 'KLineChartWC',
          formats: ['es'],
          fileName: () => 'web-component.js',
        }
      : {
          entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
          name: 'KlineChart',
          formats: ['es', 'cjs'],
          fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
        },
    rolldownOptions: {
      external: isWC
        ? [/@363045841yyt\/klinechart-script/]
        : [
            'vue',
            /@363045841yyt\/klinechart-core/,
            /@363045841yyt\/klinechart-agent-runtime/,
            /@363045841yyt\/klinechart-script/,
          ],
      output: isWC ? { inlineDynamicImports: true } : { globals: { vue: 'Vue' } },
    },
  },
})
