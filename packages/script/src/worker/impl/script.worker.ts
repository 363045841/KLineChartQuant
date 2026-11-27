/** 浏览器计算线程入口：把 Worker 全局接成消息端点。 */

import { startScriptWorker } from './startScriptWorker.js'

startScriptWorker({
  onMessage(listener) {
    globalThis.onmessage = (event: MessageEvent) => listener(event.data)
  },
  postMessage(message, transfer) {
    if (transfer === undefined) globalThis.postMessage(message)
    else globalThis.postMessage(message, { transfer: [...transfer] })
  },
})
