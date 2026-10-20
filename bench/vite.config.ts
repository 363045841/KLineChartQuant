/** 渲染基准专用 Vite 配置，仅负责加载 bench 页面与项目源码。 */

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../scripts/core-source-aliases.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const coreSrc = `${root}/packages/core/src`

export default defineConfig({
  plugins: [babel({
    include: [/\/src\/.*\.tsx?$/], exclude: [/node_modules/],
    babelConfig: { babelrc: false, configFile: false, plugins: [
      ['@babel/plugin-proposal-decorators', { version: '2023-11' }], ['@babel/plugin-transform-typescript'],
    ] },
  })],
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: createCoreSourceAliases(coreSrc),
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})
