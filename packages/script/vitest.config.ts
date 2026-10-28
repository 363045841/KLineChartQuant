/** 脚本测试配置：只在 Node 环境运行，QuickJS WASM 在 setup 中预加载一次。 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 持久化 transform 缓存，跨 vitest 进程复用（Vitest 5+）
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**'],
    },
  },
})
