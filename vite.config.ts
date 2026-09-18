import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import vueDevTools from 'vite-plugin-vue-devtools'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'

const decoratorTransform = babel({
  include: [/\/packages\/.*\.tsx?$/],
  exclude: [/node_modules/],
  babelConfig: {
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [
      ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
      ['@babel/plugin-transform-typescript'],
    ],
  },
})

export default defineConfig({
  plugins: [
    decoratorTransform,
    vue(),
    vueDevTools(),
    Components({
      resolvers: [IconsResolver()],
    }),
    Icons({
      compiler: 'vue3',
      autoInstall: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/stock': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/public': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})