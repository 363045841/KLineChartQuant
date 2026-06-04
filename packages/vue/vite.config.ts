import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import Icons from 'unplugin-icons/vite'

const isWC = process.env.BUILD_TARGET === 'web-component'

export default defineConfig({
    plugins: [
        vue(),
        Icons({ compiler: 'vue3', autoInstall: true }),
        ...(isWC
            ? []
            : [
                  dts({
                      tsconfigPath: fileURLToPath(
                          new URL('./tsconfig.build.json', import.meta.url),
                      ),
                  }),
              ]),
    ],

    build: {
        target: 'esnext',
        lib: isWC
            ? {
                  entry: fileURLToPath(new URL('./src/web-component.ts', import.meta.url)),
                  name: 'KLineChartWC',
                  formats: ['es'],
                  fileName: () => 'kline-chart.js',
              }
            : {
                  entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
                  name: 'KLineChartVue',
                  formats: ['es', 'cjs'],
                  fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
              },
        rollupOptions: {
            external: isWC ? [] : ['vue', /@363045841yyt\/klinechart-core/],
            output: {
                globals: { vue: 'Vue' },
            },
        },
        cssCodeSplit: !isWC,
    },
})
