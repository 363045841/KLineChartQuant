/** 脚本测试配置：只在 Node 环境运行，QuickJS WASM 在 setup 中预加载一次。 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 持久化 transform 缓存，跨 vitest 进程复用（Vitest 5+）
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    // QuickJS/WASM 与真实 Worker 的集成用例耗时随脚本规模增长；超时只做卡死保护，
    // 不在单条用例里写死紧预算，避免换机器或换运行器版本就假失败。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**'],
    },
  },
})
