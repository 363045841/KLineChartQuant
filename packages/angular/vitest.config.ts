import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import { createCoreSourceAliases } from '../../scripts/core-source-aliases.mjs'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
// Legacy engine root —needed so `@/...` imports inside src/core/chart.ts
// resolve while the package transitively loads createChartController.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))
const coreAliases = createCoreSourceAliases(coreSrc)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/_setup.ts'],
  },
  resolve: {
    alias: [...coreAliases, { find: /^@\//, replacement: `${repoSrc}/` }],
  },
})
