import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // 持久化 transform 缓存，跨 vitest 进程复用（Vitest 5+），默认落在 workspace 根的 node_modules 下
      fsModuleCache: true,
      environment: 'jsdom',
      exclude: [
        ...configDefaults.exclude,
        'e2e/**',
        '**/*.integration.test.ts',
        // Sub-packages have their own vitest configs (jsdom for React/Vue,
        // node for core/Angular) and per-package `@klinechart-quant/core`
        // aliases. Running them under the root config would fail to resolve
        // the workspace package. Use `pnpm -r test` to fan out across packages.
        'packages/**',
      ],
      root: fileURLToPath(new URL('./', import.meta.url)),
      env: {
        VITE_BAOSTOCK_API_BASE_URL: 'http://127.0.0.1:8000',
      },
    },
  }),
)
