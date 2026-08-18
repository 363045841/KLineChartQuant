import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
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
    vueResolverPlugin,
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
    vue(),
    Icons({ compiler: 'vue3' }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    alias: [...coreAliases, { find: /^@\//, replacement: `${repoSrc}/` }],
  },
})
