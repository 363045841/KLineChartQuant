/** 测试使用真实 Node 线程运行 Script Worker 发布产物，只桥接浏览器消息 API。 */

import { URL as NodeURL } from 'node:url'
import { Worker } from 'node:worker_threads'

/** Vite 可把浏览器入口改写成 HTTP URL；真实 Node 线程始终加载对应的本地发布产物。 */
const workerEntries = {
  'script.worker.js': new NodeURL('../../../dist/worker/impl/script.worker.js', import.meta.url),
  'compiler.worker.js': new NodeURL(
    '../../../dist/worker/compiler/impl/compiler.worker.js',
    import.meta.url,
  ),
}

export class NodeScriptWorker extends EventTarget {
  private readonly thread: Worker

  /** 默认加载构建后的 Script 入口，不在测试中模拟脚本计算。 */
  constructor(url = workerEntries['script.worker.js']) {
    super()
    const name = new NodeURL(url.href).pathname.split('/').at(-1)!.replace(/\.ts$/, '.js')
    const entry = workerEntries[name as keyof typeof workerEntries]
    if (!entry) throw new Error(`未知的测试 Worker 入口：${url.href}`)
    this.thread = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads')
      globalThis.postMessage = (message, options) => parentPort.postMessage(message, options?.transfer)
      // 执行浏览器发布产物时隐藏 Node 探测入口，避免依赖选择未打包的 Node 分支。
      globalThis.process = undefined
      import(workerData).then(() => {
        parentPort.on('message', (data) => globalThis.onmessage({ data }))
      })
    `,
      {
        eval: true,
        workerData: entry.href,
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
  postMessage(message: unknown, transfer: readonly ArrayBuffer[] = []): void {
    this.thread.postMessage(message, transfer)
  }

  /** 结束计算线程。 */
  terminate(): void {
    void this.thread.terminate()
  }
}
