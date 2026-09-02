import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

import { createCoreSourceAliases } from '../../../scripts/core-source-aliases.mjs'

const decoratorTransform = babel({
  include: [/\/src\/.*\.tsx?$/],
  exclude: [/node_modules/],
  babelConfig: {
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [
      ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
      ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
    ],
  },
})

const root = fileURLToPath(new URL('../../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`
const agentContracts = `${root}/packages/agent-runtime/src/contracts/ui.ts`

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
  plugins: [decoratorTransform, vue(), Icons({ compiler: 'vue3', autoInstall: true })],
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    alias: [
      ...createCoreSourceAliases(coreSrc),
      {
        find: /^@363045841yyt\/klinechart-ai-runtime$/,
        replacement: `${root}/packages/ai-runtime/src/browser.ts`,
      },
      {
        find: /^@363045841yyt\/klinechart-agent-runtime\/contracts\/ui$/,
        replacement: agentContracts,
      },
      {
        find: /^@363045841yyt\/klinechart-agent-runtime$/,
        replacement: `${root}/packages/agent-runtime/src/index.ts`,
      },
    ],
  },
})
