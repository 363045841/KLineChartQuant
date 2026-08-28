/** Desktop Renderer unit and component test configuration. */
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'

const sourceRoot = fileURLToPath(new URL('./src', import.meta.url))
const agentRuntime = fileURLToPath(new URL('../agent-runtime/src/index.ts', import.meta.url))
const agentContracts = fileURLToPath(new URL('../agent-runtime/src/contracts/ui.ts', import.meta.url))

export default defineConfig({
  plugins: [vue(), Icons({ compiler: 'vue3' })],
  resolve: {
    alias: [
      {
        find: /^@363045841yyt\/klinechart-agent-runtime\/contracts\/ui$/,
        replacement: agentContracts,
      },
      {
        find: /^@363045841yyt\/klinechart-agent-runtime$/,
        replacement: agentRuntime,
      },
      { find: /^@\//, replacement: `${sourceRoot}/` },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
    passWithNoTests: true,
  },
})
