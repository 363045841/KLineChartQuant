/**
 * 测试用宿主事件流：把连接抽象成可驱动的句柄。
 *
 * 用例直接触发 open/data/error，不需要 EventSource，也不需要真实网络。
 */
import type { EventStreamFactory, EventStreamHandlers } from '../../types.js'

/** 一次打开的假连接；关闭次数用于断言所有权。 */
export interface FakeEventStream {
  readonly url: string
  readonly handlers: EventStreamHandlers
  closeCount: number
}

export interface EventStreamKit {
  readonly factory: EventStreamFactory
  readonly streams: readonly FakeEventStream[]
  /** 最近一次打开的连接；尚未建连时为 undefined。 */
  last(): FakeEventStream | undefined
}

/** 创建事件流替身；每次打开都记录地址与回调。 */
export function createEventStreamKit(): EventStreamKit {
  const streams: FakeEventStream[] = []
  const factory: EventStreamFactory = (url, handlers) => {
    const stream: FakeEventStream = { url, handlers, closeCount: 0 }
    streams.push(stream)
    return {
      close() {
        stream.closeCount += 1
      },
    }
  }
  return { factory, streams, last: () => streams.at(-1) }
}

/** 必然失败的宿主事件流：装配测试不建立真实连接时使用。 */
export const unavailableEventStream: EventStreamFactory = () => {
  throw new Error('Event stream is unavailable in this test')
}
