/**
 * Web Component 包的构建配置。
 *
 * 入口复用 vue 包的源码，只换交付形态：普通库把 vue 交给宿主，自定义元素必须能脱离
 * Vue 环境单独运行，所以整个应用（含 Vue 运行时与内置数据源）打成单文件。
 * 独立编辑器页由 @363045841yyt/klinechart-script-editor 提供，不在此打包。
 */
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins: [
    vue({ customElement: true }),
    Icons({ compiler: 'vue3', autoInstall: true }),
    // 组件样式随元素一起下发，宿主不必额外引入样式表。
    cssInjectedByJs(),
  ],

  // 源码在 vue 包里，别名只服务这里对它的引用；vue 包自己的构建配置与此无关。
  resolve: {
    alias: [
      { find: /^@vue-src\//, replacement: fileURLToPath(new URL('../vue/src/', import.meta.url)) },
    ],
  },

  build: {
    target: 'esnext',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'KLineChartWC',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      // AGPL 的 script 系列仍按可选依赖动态加载，UI 代码本身留在 Apache 一侧。
      external: [/@363045841yyt\/klinechart-script/],
      output: { inlineDynamicImports: true },
    },
  },
})
