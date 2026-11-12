import { defineConfig } from 'vitest/config'

// 回测引擎只跑在 Node 侧：纯计算 + 文件读写，不需要 jsdom。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
