import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import babel from 'vite-plugin-babel'

// Some modules and their transitive dependencies use `@/...` aliases
// and `@Indicator()` decorators — so we mirror the babel transform here.
// tsconfig maps @/core/* → packages/core/src/engine/,
// @/* → packages/core/src/. We replicate that for Vitest.
const engineSrc = fileURLToPath(new URL('./src/engine/', import.meta.url))
const pkgSrc = fileURLToPath(new URL('./src/', import.meta.url))
const foundationTypesSrc = fileURLToPath(new URL('./src/foundation/types/', import.meta.url))
const foundationPluginSrc = fileURLToPath(new URL('./src/foundation/plugin/', import.meta.url))
const foundationUtilsSrc = fileURLToPath(new URL('./src/foundation/utils/', import.meta.url))

export default defineConfig({
  plugins: [
    babel({
      include: [/\/src\/.*\.tsx?$/],
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
    alias: [
      // @/core/* → packages/core/src/engine/ (most specific, must come first)
      { find: /^@\/core\//, replacement: `${engineSrc}` },
      // @/types/* → packages/core/src/foundation/types/
      { find: /^@\/types\//, replacement: `${foundationTypesSrc}` },
      // @/plugin → packages/core/src/foundation/plugin/
      { find: /^@\/plugin$/, replacement: `${foundationPluginSrc}` },
      // @/utils/* → packages/core/src/foundation/utils/
      { find: /^@\/utils\//, replacement: `${foundationUtilsSrc}` },
      // @/* → packages/core/src/* (general fallback)
      { find: /^@\//, replacement: `${pkgSrc}` },
    ],
  },
})
