import { defineConfig } from 'vitest/config'

/** 语言服务与只读代码视图需要在 DOM 中运行 CodeMirror。 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
})
