import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**', '**/*.integration.test.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      env: {
        VITE_BAOSTOCK_API_BASE_URL: 'http://127.0.0.1:8000',
      },
    },
  }),
)
