import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'
import { createWorkspaceSourceAliases } from '../../scripts/package-source-aliases.mjs'
import { indicatorEntrypointsPlugin } from '../../scripts/indicator-entrypoints-plugin.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: entry('electron/main.ts'),
        external: [
          'electron',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: entry('electron/preload.ts'),
        external: ['electron'],
        // 窗口开启了 sandbox，sandbox 化的 preload 只能加载 CommonJS。
        output: { format: 'cjs', entryFileNames: 'preload.cjs' },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [
      indicatorEntrypointsPlugin(),
      babel({
        include: [/\/packages\/core\/src\/.*\.tsx?$/],
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
      }),
      vue(),
      Icons({ compiler: 'vue3', autoInstall: true }),
    ],
    build: {
      rollupOptions: {
        input: entry('index.html'),
      },
    },
    resolve: {
      // 渲染进程按包名导入 workspace 各包（含 Vue UI），统一解析到源码，保留热更新且不依赖
      // 预先构建 dist；core 另由 createCoreSourceAliases 补齐 @/ 与 Indicator 深层入口。
      alias: [
        ...createCoreSourceAliases(coreSrc),
        ...createWorkspaceSourceAliases(root, { exclude: [coreSrc] }),
      ],
    },
  },
})
