import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
// Legacy engine root — needed so `@/...` imports inside src/core/chart.ts
// resolve while the package transitively loads createChartController.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
    },
    resolve: {
        // Order matters: more-specific subpath aliases come first so the bare
        // package alias does not match longer paths like `.../reactivity`.
        alias: [
            { find: /^@363045841yyt\/klinechart-core\/reactivity$/, replacement: `${coreSrc}/reactivity/index.ts` },
            { find: /^@363045841yyt\/klinechart-core\/controllers$/, replacement: `${coreSrc}/controllers/index.ts` },
            { find: /^@363045841yyt\/klinechart-core$/, replacement: `${coreSrc}/index.ts` },
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
