import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import dts from 'vite-plugin-dts'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    dts({
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.app.json',
    }),
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

  // 让手机/局域网设备可以访问本机 dev server
  // 同时通过 Vite proxy 转发 /api -> AKTools(本机 8080)，避免浏览器 CORS 问题
  server: {
    host: '0.0.0.0',
    proxy: {
      // baostock 数据源 (端口 8000)
      '/api/stock': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // 东财等 AKTools 数据源 (端口 8080)
      '/api/public': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },

  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'klinechart',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: ['vue', 'ajv'],
      output: {
        globals: { vue: 'Vue', ajv: 'Ajv' },
      },
    },
  },
  // publicDir 默认为 'public'，不要禁用，mock 数据需要从 public/ 提供
})
