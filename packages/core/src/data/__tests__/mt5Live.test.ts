/** Mt5LiveSource 与 RealtimeBarsConnector 测试：esFactory 注入假 EventSource，无网络依赖。 */
import { describe, expect, it } from 'vitest'

import { Mt5LiveSource, RealtimeBarsConnector } from '../live/mt5BarsLive'

/** 可手动触发 open/error/message 的 EventSource 替身。 */
class FakeEventSource {
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  closed = false
  readonly url: string

  constructor(url: string) {
    this.url = url
  }

  close(): void {
    this.closed = true
  }
}

function createSource() {
  const instances: FakeEventSource[] = []
  const source = new Mt5LiveSource('XAUUSD', '4h', 'http://127.0.0.1:8090', (url) => {
    const es = new FakeEventSource(url)
    instances.push(es)
    return es as unknown as EventSource
  })
  return { source, instances }
}

describe('Mt5LiveSource', () => {
  it('connects to the mt5 stream endpoint and forwards parsed frames', () => {
    const { source, instances } = createSource()
    const statuses: string[] = []
    const frames: unknown[] = []
    source.onStatus((status) => statuses.push(status))
    source.onFrame((frame) => frames.push(frame))

    source.connect()
    expect(instances[0]!.url).toBe(
      'http://127.0.0.1:8090/api/v1/market-data/sources/mt5/stream?symbol=XAUUSD&period=4h',
    )
    instances[0]!.onopen?.()
    instances[0]!.onmessage?.({
      data: JSON.stringify({ type: 'snapshot', symbol: 'XAUUSD', period: '4h', bars: [] }),
    })

    expect(statuses).toEqual(['connecting', 'connected'])
    expect(frames).toEqual([{ type: 'snapshot', symbol: 'XAUUSD', period: '4h', bars: [] }])
    source.disconnect()
  })

  it('reports parse errors and keeps the connection', () => {
    const { source, instances } = createSource()
    const errors: string[] = []
    source.onError((err) => errors.push(err.message))
    source.connect()

    instances[0]!.onmessage?.({ data: 'not-json' })

    expect(errors).toHaveLength(1)
    expect(instances[0]!.closed).toBe(false)
    source.disconnect()
  })

  it('ignores keepalive comment payloads', () => {
    const { source, instances } = createSource()
    const frames: unknown[] = []
    source.onFrame((frame) => frames.push(frame))
    source.connect()

    instances[0]!.onmessage?.({ data: ': keepalive' })
    instances[0]!.onmessage?.({ data: '' })

    expect(frames).toEqual([])
    source.disconnect()
  })
})

describe('RealtimeBarsConnector', () => {
  function setup() {
    const { source, instances } = createSource()
    const writes: { timestamp: number; close: number }[][] = []
    const sink = {
      updateBars: (bars: ReadonlyArray<{ timestamp: number; close: number }>) => {
        writes.push(bars.map((bar) => ({ timestamp: bar.timestamp, close: bar.close })))
      },
    }
    const connector = new RealtimeBarsConnector(sink, source)
    connector.start()
    return { source, instances, writes, connector }
  }

  it('merges a closed frame with the following forming frame into one atomic write', () => {
    const { source, instances, writes } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        symbol: 'XAUUSD',
        period: '4h',
        bar: { timestamp: 1000, open: 1, high: 2, low: 0, close: 2, volume: 50 },
      }),
    })
    expect(writes).toEqual([]) // closed 先暂存，等 forming 合并
    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'forming',
        symbol: 'XAUUSD',
        period: '4h',
        bar: { timestamp: 2000, open: 2, high: 3, low: 1, close: 2.5 },
      }),
    })

    expect(writes).toEqual([
      [
        { timestamp: 1000, close: 2 },
        { timestamp: 2000, close: 2.5 },
      ],
    ])
  })

  it('writes a lone forming update immediately', () => {
    const { source, instances, writes } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'forming',
        symbol: 'XAUUSD',
        period: '4h',
        bar: { timestamp: 2000, open: 2, high: 3, low: 1, close: 3, volume: 5 },
      }),
    })

    expect(writes).toEqual([[{ timestamp: 2000, close: 3 }]])
  })

  it('writes snapshot batches directly and drops any stashed closed bar', () => {
    const { source, instances, writes } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        symbol: 'XAUUSD',
        period: '4h',
        bar: { timestamp: 1000, open: 1, high: 2, low: 0, close: 2 },
      }),
    })
    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        symbol: 'XAUUSD',
        period: '4h',
        bars: [
          { timestamp: 1000, open: 1, high: 2, low: 0, close: 2 },
          { timestamp: 2000, open: 2, high: 3, low: 1, close: 2.5 },
        ],
      }),
    })

    expect(writes).toEqual([
      [
        { timestamp: 1000, close: 2 },
        { timestamp: 2000, close: 2.5 },
      ],
    ])
  })

  it('flushes a stashed closed bar on stop so the final value is not lost', () => {
    const { source, instances, writes, connector } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        symbol: 'XAUUSD',
        period: '4h',
        bar: { timestamp: 1000, open: 1, high: 2, low: 0, close: 2 },
      }),
    })
    connector.stop()

    expect(writes).toEqual([[{ timestamp: 1000, close: 2 }]])
    expect(instances[0]!.closed).toBe(true)
  })
})
