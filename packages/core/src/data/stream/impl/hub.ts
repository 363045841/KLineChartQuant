/** 连接注册表：按连接键复用物理连接，只做引用计数与键映射，不做任何连接决策。 */

import type { StreamHub, StreamSubscriptionRequest, StreamTransportFactory } from '../types.js'
import { type ManagedConnection, type StreamScheduler, createConnection } from './connection.js'
import type { BackoffPolicy } from './policy.js'
import { assertSubscription } from './protocol.js'

/** 注册表依赖：传输由组合根决定，状态机参数可注入。 */
export interface StreamHubOptions {
  readonly createTransport: StreamTransportFactory
  readonly scheduler?: StreamScheduler
  readonly policy?: BackoffPolicy
  readonly staleMs?: number
  readonly watchdogMs?: number
}

/** 连接键：报价按来源，K 线按来源 + 序列参数；同键订阅共享一条连接。 */
function connectionKey(request: StreamSubscriptionRequest): string {
  if (request.channel === 'quotes') return `${request.source}|quotes`
  return `${request.source}|bars|${request.period}|${request.barAggregation}|${request.adjustment}`
}

/**
 * 创建连接注册表。
 *
 * 引用计数是唯一职责：第一条订阅建连接，最后一条离开销毁连接。
 * 重连、存活与事件全部属于连接自身。
 *
 * @param options - 传输工厂与状态机参数
 * @returns 全仓唯一的连接入口
 */
export function createStreamHub(options: StreamHubOptions): StreamHub {
  const connections = new Map<string, ManagedConnection>()
  let disposed = false

  return {
    subscribe(request) {
      if (disposed) throw new TypeError('Stream hub is disposed')
      assertSubscription(request)
      const key = connectionKey(request)
      const existing = connections.get(key)
      if (existing !== undefined) return existing.subscribe(request)
      let created: ManagedConnection
      created = createConnection({
        source: request.source,
        channel: request.channel,
        ...(request.period === undefined ? {} : { period: request.period }),
        ...(request.adjustment === undefined ? {} : { adjustment: request.adjustment }),
        ...(request.barAggregation === undefined ? {} : { barAggregation: request.barAggregation }),
        createTransport: options.createTransport,
        ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
        ...(options.policy === undefined ? {} : { policy: options.policy }),
        ...(options.staleMs === undefined ? {} : { staleMs: options.staleMs }),
        ...(options.watchdogMs === undefined ? {} : { watchdogMs: options.watchdogMs }),
        onEmpty: () => {
          created.dispose()
          connections.delete(key)
        },
      })
      connections.set(key, created)
      return created.subscribe(request)
    },
    resume() {
      for (const connection of connections.values()) connection.resume()
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const connection of connections.values()) connection.dispose()
      connections.clear()
    },
  }
}
