/** Node 计算线程入口：把 parentPort 接成消息端点。 */

import { parentPort } from 'node:worker_threads'
import { startScriptWorker } from './startScriptWorker.js'

const port = parentPort
if (port === null) throw new Error('Script worker must run inside worker_threads')

startScriptWorker({
  onMessage(listener) {
    port.on('message', (data: unknown) => listener(data))
  },
  postMessage(message, transfer) {
    if (transfer === undefined) port.postMessage(message)
    else port.postMessage(message, [...transfer])
  },
})
