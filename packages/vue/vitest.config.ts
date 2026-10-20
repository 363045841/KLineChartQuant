import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'
import { createWorkspaceSourceAliases } from '../../scripts/package-source-aliases.mjs'
import { indicatorEntrypointsPlugin } from '../../scripts/indicator-entrypoints-plugin.mjs'
import { contractResourcesPlugin } from '../script/scripts/contract-resources-plugin.mjs'
import { scriptEditorPagePlugin } from './scripts/script-editor-page-plugin.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
const vueSrc = fileURLToPath(new URL('./src', import.meta.url))
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))
const coreAliases = createCoreSourceAliases(coreSrc)

const vueResolverPlugin = {
  name: 'vue-resolver',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (source.endsWith('.vue') && importer) {
      const resolved = resolve(dirname(importer), source)
      if (existsSync(resolved)) return resolved
    }
    return null
  },
}

export default defineConfig({
  plugins: [
    scriptEditorPagePlugin(),
    contractResourcesPlugin(),
    indicatorEntrypointsPlugin(),
    vueResolverPlugin,
    babel({
      include: [/\/src\/.*\.tsx?$/],
      exclude: [/node_modules/],
      babelConfig: {
        babelrc: false,
        configFile: false,
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
          ['@babel/plugin-transform-typescript'],
        ],
      },
    }),
    vue(),
    Icons({ compiler: 'vue3' }),
  ],
  test: {
    // 持久化 transform 缓存，跨 vitest 进程复用（Vitest 5+）
    fsModuleCache: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    alias: [
      // workspace 各包按各自 exports 解析到源码，新增包自动纳入；core 另由 coreAliases
      // 补齐 @/ 与 Indicator 深层入口，vue 包自身走相对路径，两者都不进入工作区扫描。
      ...coreAliases,
      ...createWorkspaceSourceAliases(root, { exclude: [coreSrc, vueSrc] }),
      { find: /^@vue-src\//, replacement: `${vueSrc}/` },
      { find: /^@\//, replacement: `${repoSrc}/` },
    ],
  },
})
