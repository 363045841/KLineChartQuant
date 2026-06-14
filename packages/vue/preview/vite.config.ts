import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

const decoratorTransform = babel({
    include: [/\/src\/.*\.tsx?$/],
    exclude: [/node_modules/],
    babelConfig: {
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        plugins: [
            ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
            ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
        ],
    },
})

const root = fileURLToPath(new URL('../../..', import.meta.url))

function r(rest: string): string {
    return `${root}/packages/core/src/${rest}`
}

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    optimizeDeps: {
        exclude: ['@363045841yyt/klinechart-core'],
    },
    server: {
        host: '0.0.0.0',
    },
    plugins: [
        decoratorTransform,
        vue(),
        Icons({ compiler: 'vue3', autoInstall: true }),
    ],
    resolve: {
        extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
        alias: [
            { find: /^@363045841yyt\/klinechart-core\/config$/, replacement: r('config/chartSettings.ts') },
            { find: /^@363045841yyt\/klinechart-core\/types\/price$/, replacement: r('types/price.ts') },
            { find: /^@363045841yyt\/klinechart-core\/semantic$/, replacement: r('semantic/index.ts') },
            { find: /^@363045841yyt\/klinechart-core\/plugin$/, replacement: r('plugin/index.ts') },
            { find: /^@363045841yyt\/klinechart-core\/reactivity$/, replacement: r('reactivity/index.ts') },
            { find: /^@363045841yyt\/klinechart-core\/controllers$/, replacement: r('controllers/index.ts') },
            { find: /^@363045841yyt\/klinechart-core\/engine\/chart$/, replacement: r('engine/chart.ts') },
            { find: /^@363045841yyt\/klinechart-core\/indicators$/, replacement: r('engine/indicators/indicatorDefinitionRegistry.ts') },
            { find: /^@363045841yyt\/klinechart-core\/engine\/utils\/zoom$/, replacement: r('engine/utils/zoom.ts') },
            { find: /^@363045841yyt\/klinechart-core\/engine\/utils\/klineConfig$/, replacement: r('engine/utils/klineConfig.ts') },
            { find: /^@363045841yyt\/klinechart-core\/engine\/renderers\/Indicator(\/.*)?$/, replacement: `${root}/packages/core/src/engine/renderers/Indicator$1` },
            { find: /^@363045841yyt\/klinechart-core\/engine\/renderers\/paneTitle$/, replacement: r('engine/renderers/paneTitle.ts') },
            { find: /^@363045841yyt\/klinechart-core\/engine\/controller\/interaction$/, replacement: r('engine/controller/interaction.ts') },
            { find: /^@363045841yyt\/klinechart-core\/engine\/drawing$/, replacement: r('engine/drawing/index.ts') },
            { find: /^@363045841yyt\/klinechart-core\/version$/, replacement: r('version.ts') },
            { find: /^@363045841yyt\/klinechart-core$/, replacement: r('index.ts') },
        ],
    },
})
