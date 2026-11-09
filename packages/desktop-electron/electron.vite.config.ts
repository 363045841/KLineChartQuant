/** 桌面三进程构建配置；Mac 兼容档位显式覆盖运行时编译目标。 */
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'
import { createWorkspaceSourceAliases } from '../../scripts/package-source-aliases.mjs'
import { resolveBuildCommit } from '../../scripts/build-commit.mjs'
import { indicatorEntrypointsPlugin } from '../../scripts/indicator-entrypoints-plugin.mjs'
import { resolveMacosBuildProfile } from '../../scripts/macos-build-profiles.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`
const buildCommit = resolveBuildCommit()
const profile = process.env.KCQ_DESKTOP_PROFILE
const targets = profile ? resolveMacosBuildProfile(profile).buildTargets : {}

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@363045841yyt/klinechart'] })],
    resolve: {
      alias: [{ find: '@363045841yyt/klinechart/workspace-tabs', replacement: entry('../vue/src/workspace-tabs.ts') }],
    },
    build: {
      ...(targets.main ? { target: targets.main } : {}),
      rollupOptions: {
        input: entry('electron/main.ts'),
        external: [
          'electron',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@363045841yyt/klinechart'] })],
    resolve: {
      alias: [{ find: '@363045841yyt/klinechart/workspace-tabs', replacement: entry('../vue/src/workspace-tabs.ts') }],
    },
    build: {
      ...(targets.main ? { target: targets.main } : {}),
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
    define: {
      'import.meta.env.VITE_KLINE_COMMIT_HASH': JSON.stringify(buildCommit.hash),
      'import.meta.env.VITE_KLINE_COMMIT_TIME': JSON.stringify(buildCommit.time),
    },
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
      ...(targets.renderer ? { target: targets.renderer } : {}),
      cssTarget: targets.renderer || 'esnext',
      rollupOptions: {
        input: entry('index.html'),
      },
    },
    resolve: {
      // 渲染进程按包名导入 workspace 各包（含 Vue UI），统一解析到源码，保留热更新且不依赖
      // 预先构建 dist；core 另由 createCoreSourceAliases 补齐 @/ 与 Indicator 深层入口，
      // vue 包内部用 @vue-src/ 自引用源码，必须与包名 alias 一起生效。
      alias: [
        { find: /^@vue-src\//, replacement: fileURLToPath(new URL('../vue/src/', import.meta.url)) },
        ...createCoreSourceAliases(coreSrc),
        ...createWorkspaceSourceAliases(root, { exclude: [coreSrc] }),
      ],
    },
  },
})
