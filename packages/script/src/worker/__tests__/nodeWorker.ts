/** 测试使用真实 Node 线程运行 Script Worker 发布产物，只桥接浏览器消息 API。 */

import { URL as NodeURL } from 'node:url'
import { Worker } from 'node:worker_threads'

export class NodeScriptWorker extends EventTarget {
  private readonly thread: Worker

  /** 默认加载构建后的 Script 入口，不在测试中模拟脚本计算。 */
  constructor() {
    super()
    this.thread = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads')
      globalThis.postMessage = (message) => parentPort.postMessage(message)
      import(workerData).then(() => {
        parentPort.on('message', (data) => globalThis.onmessage({ data }))
      })
    `,
      {
        eval: true,
        workerData: new NodeURL('../../../dist/worker/impl/script.worker.js', import.meta.url).href,
      },
    )
    this.thread.on('message', (data: unknown) => {
      this.dispatchEvent(new MessageEvent('message', { data }))
    })
    this.thread.on('error', (error) => {
      this.dispatchEvent(
        Object.assign(new Event('error'), {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    })
    this.thread.on('messageerror', () => this.dispatchEvent(new Event('messageerror')))
    this.thread.unref()
  }

  /** 跨线程发送实际消息。 */
  postMessage(message: unknown): void {
    this.thread.postMessage(message)
  }

  /** 结束计算线程。 */
  terminate(): void {
    void this.thread.terminate()
  }
}
