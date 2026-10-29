/**
 * build-worker.mjs
 *
 * 把浏览器端的 Script Worker 打成自包含文件，覆盖 tsc 产出的同名文件。
 * tsc 只做转译，worker 里的 quickjs 仍是裸 import，dev server 不会为它再做一次打包，
 * 结果就是 Worker 初始化失败。发布物必须自带一份能直接加载的 Worker。
 *
 * 用法：node scripts/build-worker.mjs（在 tsc 之后执行）
 */
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const entry = fileURLToPath(new URL('../src/worker/impl/script.worker.ts', import.meta.url))

await build({
  configFile: false,
  root: packageRoot,
  logLevel: 'warn',
  build: {
    target: 'esnext',
    outDir: 'dist/worker/impl',
    emptyOutDir: false,
    // 单文件交付：wasm 一并内联，Worker 不依赖任何相对资源。
    assetsInlineLimit: 100_000_000,
    lib: {
      entry,
      formats: ['es'],
      fileName: () => 'script.worker.js',
    },
    rolldownOptions: {
      output: {
        entryFileNames: 'script.worker.js',
        chunkFileNames: 'script.worker-[hash].js',
        assetFileNames: 'script.worker-[hash][extname]',
      },
    },
  },
})

console.log('[script-worker] dist/worker/impl/script.worker.js 已打包为自包含产物')
