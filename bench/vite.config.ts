/** 渲染基准专用 Vite 配置，仅负责加载 bench 页面与项目源码。 */

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

import { createCoreSourceAliases } from '../scripts/core-source-aliases.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const coreSrc = `${root}/packages/core/src`

export default defineConfig({
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
