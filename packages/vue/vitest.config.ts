import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'

// Legacy engine root —needed so `@/...` imports inside src/core/chart.ts
// resolve while the package transitively loads createChartController.
// Also needed for @Indicator() decorator transform.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

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
                    ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
                ],
            },
        }),
        vue(),
    ],
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: [
            // Order matters: subpath aliases MUST be listed before the
            // bare package alias so vite's longest-prefix match wins.
            {
                find: '@363045841yyt/klinechart-core/reactivity',
                replacement: new URL('../core/src/reactivity/index.ts', import.meta.url).pathname,
            },
            {
                find: '@363045841yyt/klinechart-core/controllers',
                replacement: new URL('../core/src/controllers/index.ts', import.meta.url).pathname,
            },
            {
                find: '@363045841yyt/klinechart-core',
                replacement: new URL('../core/src/index.ts', import.meta.url).pathname,
            },
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
