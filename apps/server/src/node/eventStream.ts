/** Node SSE 适配器；连接状态机拥有重连，EventSource 负责协议。 */
import { EventSource } from 'eventsource'
import type { EventStreamFactory } from '@363045841yyt/klinechart-core/node'

/** 将标准 EventSource 消息映射到行情流端口。 */
export function createEventStream(fetchImpl: typeof fetch): EventStreamFactory {
  return (url, handlers) => {
    const source = new EventSource(url, { fetch: fetchImpl })
    source.onopen = handlers.onOpen
    source.onmessage = (event) => handlers.onData(event.data)
    source.onerror = handlers.onError
    return { close: () => source.close() }
  }
}
