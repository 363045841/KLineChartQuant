/**
 * SSE 传输：把宿主事件流接入统一连接状态机。
 *
 * 传输的职责只有三条：按请求打开连接、把 `data:` 解析成帧、关闭时上报原因。
 * 失败一律关闭连接并上报；重连时机只由连接状态机决定，宿主事件流不得自行重连。
 */
import type { EventStream, EventStreamFactory, StreamTransport, StreamTransportFactory } from '../types.js'
import { buildStreamUrl, parseStreamFrame } from './protocol.js'

/**
 * 创建 SSE 传输工厂。
 *
 * @param openEventStream - 宿主事件流；浏览器为 EventSource，Node 为 fetch 流
 * @param baseUrl - 数据源生效地址的读取函数，装配时确定、建连时求值
 * @returns 供连接状态机使用的传输工厂
 */
export function createSseTransport(
  openEventStream: EventStreamFactory,
  baseUrl: () => string,
): StreamTransportFactory {
  return (request, handlers): StreamTransport => {
    let stream: EventStream | null = null
    let closed = false
    let generation = 0

    /** 结束本次传输；关闭事实只上报一次。 */
    const settle = (retryable: boolean, message: string): void => {
      if (closed) return
      closed = true
      stream?.close()
      stream = null
      handlers.onClose({ retryable, message })
    }

    /** 回调是否仍属于当前这次连接；旧连接的迟到事件直接丢弃。 */
    const current = (mine: number): boolean => !closed && generation === mine

    return {
      open() {
        if (closed) return
        const mine = ++generation
        const created = openEventStream(buildStreamUrl(request, baseUrl()), {
          onOpen: () => {
            if (current(mine)) handlers.onOpen()
          },
          onData: (data) => {
            if (!current(mine)) return
            if (data === '' || data.startsWith(':')) return
            try {
              handlers.onFrame(parseStreamFrame(JSON.parse(data) as unknown))
            } catch (error) {
              // 解析失败意味着与协议失去同步：关闭并重连，而不是带着错误语义继续消费。
              settle(
                true,
                `Stream protocol error: ${error instanceof Error ? error.message : String(error)}`,
              )
            }
          },
          onError: () => {
            if (current(mine)) settle(true, 'SSE transport error')
          },
        })
        // 打开阶段的同步错误可能已经结束传输，此时不能留下悬挂连接。
        if (closed) {
          created.close()
          return
        }
        stream = created
      },
      close() {
        settle(false, 'Stream closed by owner')
      },
    }
  }
}
