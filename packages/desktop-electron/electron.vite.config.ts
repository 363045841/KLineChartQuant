import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: entry('electron/main.ts'),
        external: ['electron', 'electron-store'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: entry('electron/preload.ts'),
        output: {
          format: 'cjs',
        },
        external: ['electron'],
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
          find: /^@363045841yyt\/klinechart-ai-runtime$/,
          replacement: `${root}/packages/ai-runtime/src/browser.ts`,
        },
      ],
    },
  },
})
