import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
const coreAliases = createCoreSourceAliases(coreSrc)

export default defineConfig({
  plugins: [
    babel({
      include: [/\/core\/src\/.*\.tsx?$/, /\/packages\/core\/src\/.*\.tsx?$/],
      exclude: [/node_modules/],
      babelConfig: {
        babelrc: false,
        configFile: false,
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
          ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: coreAliases,
  },
})
