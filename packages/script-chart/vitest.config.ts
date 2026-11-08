import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 适配层是纯接线，测试在 Node 环境运行，不需要浏览器能力。
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../core/src', import.meta.url)) } },
  test: {
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
