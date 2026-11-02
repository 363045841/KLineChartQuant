/** 消费者构建配置：不放任何指向仓库源码的 alias，解析全部走 node_modules。 */
import { defineConfig } from 'vite'

export default defineConfig({
  build: { target: 'esnext' },
})
