/**
 * preview/vite.config.ts
 *
 * packages/vue 的预览开发服务器配置。除 alias 到 workspace 源码外，还把各包 src 目录
 * 整树加入 watcher：Vite 只递归监听 config.root，root 之外的源码靠加载时逐文件补挂，
 * 新增/删除/重写文件时不触发 HMR（issue #194）。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

import { createCoreSourceAliases } from '../../../scripts/core-source-aliases.mjs'
import {
  collectWorkspaceSourceDirs,
  createWorkspaceSourceAliases,
} from '../../../scripts/package-source-aliases.mjs'
import { indicatorEntrypointsPlugin } from '../../../scripts/indicator-entrypoints-plugin.mjs'
import { contractResourcesPlugin } from '../../../packages/script/scripts/contract-resources-plugin.mjs'

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

const root = fileURLToPath(new URL('../../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`
const vueSrc = `${root}/packages/vue/src`

/**
 * 把 workspace 源码目录整树加入 watcher，使 root 外源码获得与 root 内一致的目录监听。
 * @param repoRoot 仓库根目录
 * @returns Vite 插件
 */
function watchWorkspaceSources(repoRoot: string): Plugin {
  return {
    name: 'klinechart:watch-workspace-sources',
    configureServer(server) {
      server.watcher.add(collectWorkspaceSourceDirs(repoRoot))
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  optimizeDeps: {
    exclude: ['@363045841yyt/klinechart-core'],
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/stock': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/public': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    contractResourcesPlugin(),
    indicatorEntrypointsPlugin(),
    watchWorkspaceSources(root),
    decoratorTransform,
    vue(),
    Icons({ compiler: 'vue3', autoInstall: true }),
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    // workspace 各包按各自 exports 解析到源码，新增包自动纳入；core 另由
    // createCoreSourceAliases 补齐 @/ 与 Indicator 深层入口，vue 包由 @vue-src/ 引用源码，
    // 两者都不再进入工作区扫描，避免重复条目。
    alias: [
      { find: /^@vue-src\//, replacement: `${vueSrc}/` },
      ...createCoreSourceAliases(coreSrc),
      ...createWorkspaceSourceAliases(root, { exclude: [coreSrc, vueSrc] }),
    ],
  },
})
