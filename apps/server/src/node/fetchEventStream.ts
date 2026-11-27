/**
 * fetch 事件流：Node 侧的 `EventStreamFactory` 实现。
 *
 * 只负责按 SSE 分帧把 `data:` 原样上报，不解析业务协议。
 */
import type { EventStream, EventStreamFactory, EventStreamHandlers } from '@363045841yyt/klinechart-core/node'

/** 一帧结束标记；SSE 以空行分隔事件。 */
const FRAME_SEPARATOR = '\n\n'

/** 从一帧文本中取出 data 行；注释帧返回空串。 */
function readData(frame: string): string {
  const lines = frame.split('\n')
  const data: string[] = []
  for (const line of lines) {
    if (line.startsWith(':')) continue
    if (!line.startsWith('data:')) continue
    data.push(line.slice(5).replace(/^ /, ''))
  }
  return data.join('\n')
}

/**
 * 创建基于 fetch 的事件流工厂。
 *
 * @param fetchImpl - 宿主 fetch
 * @returns 供行情 Provider 使用的事件流工厂
 */
export function createFetchEventStream(fetchImpl: typeof fetch): EventStreamFactory {
  return (url: string, handlers: EventStreamHandlers): EventStream => {
    const controller = new AbortController()
    let closed = false

    /** 读取整个响应体并按空行切帧。 */
    async function pump(): Promise<void> {
      try {
        const response = await fetchImpl(url, {
          headers: { accept: 'text/event-stream' },
          signal: controller.signal,
        })
        if (!response.ok || response.body === null)
          throw new Error(`SSE request failed: ${response.status} ${response.statusText}`)
        handlers.onOpen()
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let index = buffer.indexOf(FRAME_SEPARATOR)
          while (index >= 0) {
            const data = readData(buffer.slice(0, index))
            buffer = buffer.slice(index + FRAME_SEPARATOR.length)
            if (data !== '') handlers.onData(data)
            index = buffer.indexOf(FRAME_SEPARATOR)
          }
        }
        if (!closed) handlers.onError()
      } catch (error) {
        if (!closed) handlers.onError()
      }
    }

    void pump()

    return {
      close() {
        if (closed) return
        closed = true
        controller.abort()
      },
    }
  }
}
