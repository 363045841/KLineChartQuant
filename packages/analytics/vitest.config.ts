import { defineConfig } from 'vitest/config'

// 分析数据采集器只跑在 Node 侧：不需要 jsdom，用例全部是纯函数与临时目录读写。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
