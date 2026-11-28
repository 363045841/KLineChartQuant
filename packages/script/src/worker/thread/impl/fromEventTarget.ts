/**
 * 浏览器线程适配：把 EventTarget 形状的 Worker 包成 `ScriptThread`。
 *
 * Web Worker 与测试替身都满足这组方法；库内只依赖 `ScriptThread` 契约。
 */
import type { ScriptThread } from '../../types.js'

/** 浏览器 Worker 的最小形状：事件 + 发送 + 终止。 */
export interface EventTargetThread extends EventTarget {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void
  terminate(): void
}

/**
 * 把 EventTarget 形状的线程接入统一端口。
 *
 * @param thread - Web Worker 或同形状的测试替身
 * @returns 与宿主无关的脚本线程
 */
export function fromEventTarget(thread: EventTargetThread): ScriptThread
export function fromEventTarget(thread: Worker): ScriptThread
export function fromEventTarget(thread: Worker | EventTargetThread): ScriptThread {
  /** 统一转移列表：DOM Worker 收可变数组，测试替身收只读数组。 */
  const send = (message: unknown, transfer?: readonly ArrayBuffer[]): void => {
    if (transfer === undefined) thread.postMessage(message)
    else thread.postMessage(message, [...transfer])
  }
  return {
    postMessage: send,
    onMessage: (listener) => {
      thread.addEventListener('message', (event) => {
        // EventTarget 只保证 Event；Worker 消息在这里统一成 data 载荷。
        listener((event as MessageEvent).data)
      })
    },
    onError: (listener) => {
      thread.addEventListener('error', (event) => {
        listener(new Error((event as ErrorEvent).message))
      })
    },
    onMessageError: (listener) => {
      thread.addEventListener('messageerror', () => listener())
    },
    terminate: () => thread.terminate(),
  }
}
