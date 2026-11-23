/** 内置 SSE 传输：把地址与原始消息转换成帧，只上报打开、帧与关闭。 */

import type {
  StreamRequest,
  StreamTransport,
  StreamTransportHandlers,
} from '../types.js'
import { buildStreamUrl, parseStreamFrame } from './protocol.js'

/** 连接只需要 EventSource 的四个成员；测试用替身满足同一形状。 */
export interface StreamEventSource {
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  close(): void
}

export type StreamEventSourceFactory = (url: string) => StreamEventSource

/**
 * 创建一条 SSE 传输。
 *
 * 传输的职责只有三条：按请求打开连接、把 `data:` 解析成帧、关闭时上报原因。
 * 失败一律关闭连接并上报，浏览器自带的自动重连被主动取消，恢复时机只由连接状态机决定。
 *
 * @param request - 连接承载的品种与序列参数
 * @param baseUrl - 数据源生效地址
 * @param handlers - 打开、帧、关闭回调
 * @param createSource - 事件源工厂；测试注入替身
 * @returns 一次性传输
 */
export function createSseTransport(
  request: StreamRequest,
  baseUrl: string,
  handlers: StreamTransportHandlers,
  createSource?: StreamEventSourceFactory,
): StreamTransport {
  let source: StreamEventSource | null = null
  let closed = false

  /** 结束本次传输；关闭事实只上报一次。 */
  const settle = (retryable: boolean, message: string): void => {
    if (closed) return
    closed = true
    source?.close()
    source = null
    handlers.onClose({ retryable, message })
  }

  return {
    open() {
      if (closed || source !== null) return
      const factory = createSource ?? ((url: string) => new EventSource(url))
      source = factory(buildStreamUrl(request, baseUrl))
      const current = source
      current.onopen = () => {
        if (source === current) handlers.onOpen()
      }
      current.onerror = () => {
        if (source !== current) return
        // 终止这一次传输；是否重连由连接状态机决定，浏览器不得自行重连。
        settle(true, 'SSE transport error')
      }
      current.onmessage = (event: MessageEvent) => {
        if (source !== current) return
        const data = event.data
        if (typeof data !== 'string' || data === '' || data.startsWith(':')) return
        try {
          handlers.onFrame(parseStreamFrame(JSON.parse(data) as unknown))
        } catch (error) {
          // 解析失败意味着与协议失去同步：关闭并重连，而不是带着错误语义继续消费。
          settle(true, `Stream protocol error: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    },
    close() {
      settle(false, 'Stream closed by owner')
    },
  }
}
