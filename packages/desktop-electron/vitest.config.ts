/** Desktop Renderer unit and component test configuration. */
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'

const sourceRoot = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  plugins: [vue(), Icons({ compiler: 'vue3' })],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${sourceRoot}/` }],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
