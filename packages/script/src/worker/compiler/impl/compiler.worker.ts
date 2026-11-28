/** 浏览器编译线程入口：把 Worker 全局接成消息端点。 */

import { startCompilerWorker } from './startCompilerWorker.js'

startCompilerWorker({
  onMessage(listener) {
    globalThis.onmessage = (event: MessageEvent) => listener(event.data)
  },
  postMessage(message) {
    globalThis.postMessage(message)
  },
})
