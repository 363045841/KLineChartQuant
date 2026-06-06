import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
    },
    resolve: {
        alias: [
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
