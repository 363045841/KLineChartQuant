/** 契约包单测：纯函数与数据模型，Node 环境即可。 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 契约包没有重 CPU 用例；超时只做卡死保护。
    testTimeout: 30_000,
  },
})
