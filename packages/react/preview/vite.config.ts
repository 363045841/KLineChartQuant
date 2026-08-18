import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

import { createCoreSourceAliases } from '../../../scripts/core-source-aliases.mjs'

const decoratorTransform = babel({
  include: [/\/packages\/core\/src\/.*\.tsx?$/],
  exclude: [/node_modules/],
  babelConfig: {
    babelrc: false,
    configFile: false,
    plugins: [
      ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
      ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
    ],
  },
})

const root = fileURLToPath(new URL('../../..', import.meta.url))
const coreSrc = `${root}/packages/core/src`

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    decoratorTransform,
    vue({ customElement: true }),
    react(),
    Icons({ compiler: 'vue3', autoInstall: true }),
  ],
  resolve: {
    alias: [
      ...createCoreSourceAliases(coreSrc),
      {
        find: /^@363045841yyt\/klinechart\/web-component$/,
        replacement: `${root}/packages/vue/src/web-component.ts`,
      },
    ],
  },
})
