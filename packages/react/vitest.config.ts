import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))
const webComponentStub = fileURLToPath(new URL('./src/__tests__/web-component.stub.ts', import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${repoSrc}/` },
      { find: '@363045841yyt/klinechart/web-component', replacement: webComponentStub },
    ],
  },
})
