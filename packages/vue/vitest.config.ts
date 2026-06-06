import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
// Legacy engine root —needed so `@/...` imports inside src/core/chart.ts
// resolve while the package transitively loads createChartController.
// Also needed for @Indicator() decorator transform.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

// Build alias entries from core package.json exports so _every_
// `@363045841yyt/klinechart-core/X` subpath resolves to its source .ts file.
const corePkg = JSON.parse(readFileSync(new URL('../core/package.json', import.meta.url), 'utf-8'))
const coreAliases: Array<{ find: string; replacement: string }> = []
for (const [key, value] of Object.entries(corePkg.exports)) {
    if (key === '.') continue
    const subpath = `@363045841yyt/klinechart-core${key.slice(1)}`
    const importPath = (value as any).import as string
    const sourcePath = importPath.replace('./dist/', '').replace(/\.js$/, '.ts')
    coreAliases.push({ find: subpath, replacement: `${coreSrc}/${sourcePath}` })
}

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
        Icons({ compiler: 'vue3' }),
    ],
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: [
            ...coreAliases,
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
