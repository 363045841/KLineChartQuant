/** BarsLiveSource 与 RealtimeBarsConnector 测试：esFactory 注入假 EventSource，无网络依赖。 */
import { describe, expect, it } from 'vitest'

import { DataBuffer } from '../buffer/dataBuffer'
import { BarsLiveSource, type LiveBar, RealtimeBarsConnector } from '../live/barsLive'

/** K 线 fixture 入参：timestamp/close 必填，确有差异的 OHLCV 字段可按需覆盖。 */
type BarOverrides = Pick<LiveBar, 'timestamp' | 'close'> &
  Partial<Omit<LiveBar, 'timestamp' | 'close'>>

/**
 * 构造 K 线测试 fixture：默认生成以 close 为开高低收的平盘 bar。
 *
 * @param overrides 必填 timestamp/close；确有差异的字段可覆盖。
 * @returns 完整 LiveBar，同时可用于 SSE 帧载荷与 KLineData 输入。
 */
function createBar(overrides: BarOverrides): LiveBar {
  const { timestamp, close, ...rest } = overrides
  return { timestamp, open: close, high: close, low: close, close, ...rest }
}

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
  const source = new BarsLiveSource(
    'mt5',
    'XAUUSD',
    '4h',
    'original',
    'http://127.0.0.1:8090',
    (url) => {
      const es = new FakeEventSource(url)
      instances.push(es)
      return es as unknown as EventSource
    },
  )
  return { source, instances }
}

describe('BarsLiveSource', () => {
  it('connects to the mt5 stream endpoint and forwards parsed frames', () => {
    const { source, instances } = createSource()
    const statuses: string[] = []
    const frames: unknown[] = []
    source.onStatus((status) => statuses.push(status))
    source.onFrame((frame) => frames.push(frame))

    source.connect()
    expect(instances[0]!.url).toBe(
      'http://127.0.0.1:8090/api/v1/market-data/sources/mt5/stream?symbol=XAUUSD&period=4h&barAggregation=original',
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
    const { instances, writes } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        symbol: 'XAUUSD',
        period: '4h',
        bar: createBar({ timestamp: 1000, close: 2 }),
      }),
    })
    expect(writes).toEqual([]) // closed 先暂存，等 forming 合并
    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'forming',
        symbol: 'XAUUSD',
        period: '4h',
        bar: createBar({ timestamp: 2000, close: 2.5 }),
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
    const { instances, writes } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'forming',
        symbol: 'XAUUSD',
        period: '4h',
        bar: createBar({ timestamp: 2000, close: 3 }),
      }),
    })

    expect(writes).toEqual([[{ timestamp: 2000, close: 3 }]])
  })

  it('writes snapshot batches directly and drops any stashed closed bar', () => {
    const { instances, writes } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        symbol: 'XAUUSD',
        period: '4h',
        bar: createBar({ timestamp: 1000, close: 2 }),
      }),
    })
    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        symbol: 'XAUUSD',
        period: '4h',
        bars: [
          createBar({ timestamp: 1000, close: 2 }),
          createBar({ timestamp: 2000, close: 2.5 }),
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

  it('aligns a snapshot through the buffer tail-write API in one publication', () => {
    const { source, instances } = createSource()
    const buffer = new DataBuffer()
    buffer.setInlineData([
      createBar({ timestamp: 10, close: 1 }),
      createBar({ timestamp: 20, close: 2 }),
      createBar({ timestamp: 30, close: 3 }),
    ])
    let publications = 0
    const unsubscribe = buffer.data.subscribe(() => {
      publications += 1
    })
    const connector = new RealtimeBarsConnector(
      { updateBars: (bars) => buffer.applyRealtimeBars(bars) },
      source,
    )
    connector.start()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        symbol: 'XAUUSD',
        period: '4h',
        bars: [
          createBar({ timestamp: 10, close: 9 }),
          createBar({ timestamp: 20, close: 8 }),
          createBar({ timestamp: 30, close: 7 }),
          createBar({ timestamp: 40, close: 6 }),
        ],
      }),
    })

    expect(buffer.getRawData().map((bar) => [bar.timestamp, bar.close])).toEqual([
      [10, 1],
      [20, 8],
      [30, 7],
      [40, 6],
    ])
    expect(publications).toBe(1)
    unsubscribe()
    connector.stop()
  })

  it('flushes a stashed closed bar on stop so the final value is not lost', () => {
    const { instances, writes, connector } = setup()

    instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        symbol: 'XAUUSD',
        period: '4h',
        bar: createBar({ timestamp: 1000, close: 2 }),
      }),
    })
    connector.stop()

    expect(writes).toEqual([[{ timestamp: 1000, close: 2 }]])
    expect(instances[0]!.closed).toBe(true)
  })
})
