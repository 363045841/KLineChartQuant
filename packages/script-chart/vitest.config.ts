import { defineConfig } from 'vitest/config'

// 适配层是纯接线，测试在 Node 环境运行，不需要浏览器能力。
export default defineConfig({
  test: {
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
