import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`
const agentRuntime = `${root}/packages/agent-runtime/src/index.ts`
const agentContracts = `${root}/packages/agent-runtime/src/contracts/ui.ts`

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
  renderer: {
    root: '.',
    plugins: [
      babel({
        include: [/\/packages\/core\/src\/.*\.tsx?$/],
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
      alias: [
        ...createCoreSourceAliases(coreSrc),
        {
          find: /^@363045841yyt\/klinechart-agent-runtime$/,
          replacement: agentRuntime,
        },
        {
          find: /^@363045841yyt\/klinechart-agent-runtime\/contracts\/ui$/,
          replacement: agentContracts,
        },
        {
          find: /^@363045841yyt\/klinechart-ai-runtime$/,
          replacement: `${root}/packages/ai-runtime/src/browser.ts`,
        },
      ],
    },
  },
})
