/**
 * 实时连接的回调表面：帧 / 状态 / 错误三组监听与广播。
 *
 * SSE 连接、宿主批量连接与池订阅共用同一实现；关闭后所有投递静默丢弃。
 */

import type { LiveFrame, RealtimeStatus } from '../types.js'

/** 帧 / 状态 / 错误监听与广播；close 之后不再投递任何事件。 */
export interface RealtimeCallbackHub {
  onFrame(callback: (frame: LiveFrame) => void): () => void
  onStatus(callback: (status: RealtimeStatus) => void): () => void
  onError(callback: (error: Error) => void): () => void
  emitFrame(frame: LiveFrame): void
  emitStatus(status: RealtimeStatus): void
  emitError(error: Error): void
  close(): void
}

/**
 * 创建一组回调监听；广播在关闭后静默。
 *
 * @returns 可注册、投递与关闭的回调表面
 */
export function createRealtimeCallbackHub(): RealtimeCallbackHub {
  const frameCbs = new Set<(frame: LiveFrame) => void>()
  const statusCbs = new Set<(status: RealtimeStatus) => void>()
  const errorCbs = new Set<(error: Error) => void>()
  let closed = false

  return {
    onFrame(callback) {
      frameCbs.add(callback)
      return () => frameCbs.delete(callback)
    },
    onStatus(callback) {
      statusCbs.add(callback)
      return () => statusCbs.delete(callback)
    },
    onError(callback) {
      errorCbs.add(callback)
      return () => errorCbs.delete(callback)
    },
    emitFrame(frame) {
      if (closed) return
      for (const callback of frameCbs) callback(frame)
    },
    emitStatus(status) {
      if (closed) return
      for (const callback of statusCbs) callback(status)
    },
    emitError(error) {
      if (closed) return
      for (const callback of errorCbs) callback(error)
    },
    close() {
      if (closed) return
      closed = true
      frameCbs.clear()
      statusCbs.clear()
      errorCbs.clear()
    },
  }
}
