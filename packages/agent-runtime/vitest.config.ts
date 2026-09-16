import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 持久化 transform 缓存，跨 vitest 进程复用（Vitest 5+）
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      // `src/testing` 是给下游测试用的 scripted 替身，对替身本身做覆盖率没有意义。
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**', 'src/testing/**'],
      // PRD §16.4 的发布门槛，低于阈值时 `pnpm coverage` 直接失败。
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
})
