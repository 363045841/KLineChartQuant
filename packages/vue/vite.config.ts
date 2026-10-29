/**
 * vue 包（普通库入口）构建配置。
 *
 * 自定义元素那份交付形态在 @363045841yyt/klinechart-web-component，独立编辑器页在
 * @363045841yyt/klinechart-script-editor；本包只有单入口，两样都不在此打包。
 */
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    Icons({ compiler: 'vue3', autoInstall: true }),
    dts({
      tsconfigPath: fileURLToPath(new URL('./tsconfig.build.json', import.meta.url)),
    }),
  ],

  resolve: {
    alias: [{ find: /^@vue-src\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }],
  },

  build: {
    target: 'esnext',
    emptyOutDir: true,
    // lib 模式默认把样式合成一个以库名命名的文件；这里按 chunk 切分，产物名固定为 index.css。
    cssCodeSplit: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'KlineChart',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: [
        'vue',
        /@363045841yyt\/klinechart-core/,
        /@363045841yyt\/klinechart-agent-runtime/,
        /@363045841yyt\/klinechart-script/,
      ],
    },
  },
})
