/**
 * worker_threads 线程：加载脚本包的 Node 入口，不再伪造浏览器全局。
 */
import { Worker } from 'node:worker_threads'
import type { ScriptThread } from '@363045841yyt/klinechart-script/worker'

/**
 * 创建一条脚本执行线程。
 *
 * @param entry - Node 线程入口的 file URL
 * @returns 与宿主无关的脚本线程
 */
export function createWorkerScriptThread(entry: URL): ScriptThread {
  const worker = new Worker(entry)
  let messageListener: ((data: unknown) => void) | undefined
  let errorListener: ((error: Error) => void) | undefined
  let messageErrorListener: (() => void) | undefined

  worker.on('message', (data: unknown) => {
    messageListener?.(data)
  })
  worker.on('error', (error) => {
    errorListener?.(error instanceof Error ? error : new Error(String(error)))
  })
  worker.on('messageerror', () => {
    messageErrorListener?.()
  })

  return {
    postMessage(message, transfer) {
      if (transfer === undefined) worker.postMessage(message)
      else worker.postMessage(message, [...transfer])
    },
    onMessage(listener) {
      messageListener = listener
    },
    onError(listener) {
      errorListener = listener
    },
    onMessageError(listener) {
      messageErrorListener = listener
    },
    terminate() {
      void worker.terminate()
    },
  }
}
