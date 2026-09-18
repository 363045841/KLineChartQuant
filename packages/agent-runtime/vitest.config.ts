import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import babel from 'vite-plugin-babel'

// `code_interpreter` 使用 2023-11 标准装饰器（Core 的 @Tool），esbuild 不支持该语法，
// 故沿用 packages/core 的 babel 转换配置。
const coreChartToolRegistry = fileURLToPath(
  new URL('../core/src/foundation/agent/chartToolRegistry.ts', import.meta.url),
)

export default defineConfig({
  plugins: [
    babel({
      include: [/\/src\/.*\.tsx?$/],
      exclude: [/node_modules/],
      babelConfig: {
        babelrc: false,
        configFile: false,
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
          ['@babel/plugin-transform-typescript'],
        ],
      },
    }),
  ],
  test: {
    // 持久化 transform 缓存，跨 vitest 进程复用（Vitest 5+）
    fsModuleCache: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**'],
    },
  },
  resolve: {
    alias: [
      // 测试直接指向 Core 源码，避免测试依赖 Core 的构建产物。
      {
        find: /^@363045841yyt\/klinechart-core\/agent-tools$/,
        replacement: coreChartToolRegistry,
      },
    ],
  },
})
