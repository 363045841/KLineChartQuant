/** SSE 帧解析：状态帧缺 status 时按未知处理，不再判协议错误。 */
import { describe, expect, it } from 'vitest'
import { createSseConnection, type LiveEventSource } from '../impl/sseConnection.js'
import type { LiveFrame, RealtimeConnectionRequest } from '../types.js'

const REQUEST: RealtimeConnectionRequest = {
  sourceId: 'binance',
  channel: 'bars',
  instrumentIds: ['binance:perp:BTCUSDT'],
  period: '60min',
  adjustment: 'none',
  barAggregation: 'original',
}

/** 可手动投递消息的事件源替身。 */
class FakeEventSource implements LiveEventSource {
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false

  close(): void {
    this.closed = true
  }

  /** 投递一帧服务端消息。 */
  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }
}

/** 建一条连接并收集帧与错误。 */
function connect() {
  const source = new FakeEventSource()
  const frames: LiveFrame[] = []
  const errors: Error[] = []
  const connection = createSseConnection(REQUEST, 'http://127.0.0.1:8091', () => source)
  connection.onFrame((frame) => frames.push(frame))
  connection.onError((error) => errors.push(error))
  connection.connect()
  return { connection, source, frames, errors }
}

describe('SSE 状态帧', () => {
  it('缺 status 时按 unknown 透传，不再报解析失败', () => {
    const { source, frames, errors } = connect()

    source.emit({
      type: 'status',
      instrumentId: 'binance:perp:BTCUSDT',
      detail: '历史数据加载中',
    })

    expect(errors).toEqual([])
    expect(frames).toEqual([
      {
        channel: 'bars',
        type: 'status',
        instrumentId: 'binance:perp:BTCUSDT',
        status: 'unknown',
        detail: '历史数据加载中',
      },
    ])
  })

  it('带 status 时原样透传', () => {
    const { source, frames } = connect()

    source.emit({
      type: 'status',
      instrumentId: 'binance:perp:BTCUSDT',
      status: 'market-closed',
    })

    expect(frames[0]).toMatchObject({ type: 'status', status: 'market-closed' })
  })

  it('未知帧类型仍然按协议错误上报', () => {
    const { source, errors } = connect()

    source.emit({ type: 'unexpected', instrumentId: 'binance:perp:BTCUSDT' })

    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('Unknown bars frame')
  })
})
