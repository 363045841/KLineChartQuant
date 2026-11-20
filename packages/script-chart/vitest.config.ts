import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 适配层是纯接线，测试在 Node 环境运行，不需要浏览器能力。
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../core/src', import.meta.url)) } },
  test: {
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 这些用例会编译并运行全部内置脚本，属于重 CPU 集成测试；统一给宽松的卡死保护，
    // 不在单条用例里写死紧预算，避免换机器/换运行器版本就假失败。
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
