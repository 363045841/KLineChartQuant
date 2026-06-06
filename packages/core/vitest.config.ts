import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import babel from 'vite-plugin-babel'

// Some modules and their transitive dependencies use `@/...` aliases
// and `@Indicator()` decorators — so we mirror the babel transform here.
// tsconfig maps @/core/* → packages/core/src/engine/,
// @/* → packages/core/src/. We replicate that for Vitest.
const engineSrc = fileURLToPath(new URL('./src/engine/', import.meta.url))
const pkgSrc = fileURLToPath(new URL('./src/', import.meta.url))

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
    ],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: [
            // @/core/* → packages/core/src/engine/ (more specific, must come first)
            { find: /^@\/core\//, replacement: `${engineSrc}` },
            // @/* → packages/core/src/* (general fallback)
            { find: /^@\//, replacement: `${pkgSrc}` },
        ],
    },
})
