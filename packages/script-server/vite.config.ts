import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

/**
 * 语言服务包的 lib 构建：只在语言会话与 Worker 内运行 TypeScript，
 * 宿主依赖保持 external，由 App 侧统一提供，避免重复打包。
 */
export default defineConfig({
  // 语言 Worker 作为独立产物随包发布，URL 必须是模块相对路径，宿主才能按自身部署位置解析。
  base: './',
  plugins: [
    dts({
      tsconfigPath: fileURLToPath(new URL('./tsconfig.build.json', import.meta.url)),
    }),
  ],
  build: {
    target: 'esnext',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: [
        /^@363045841yyt\/klinechart-script/,
        /^@codemirror\//,
        '@valtown/codemirror-ts',
        'comlink',
        'markdown-it',
        'typescript',
      ],
    },
  },
  worker: { format: 'es' },
})
