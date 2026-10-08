/** 验证成交 Buffer 的历史/实时重叠去重、断序撤销和请求取消。 */
import { describe, expect, it, vi } from 'vitest'
import type { InstrumentDescriptor } from '../../provider/types.js'
import { createTradeBuffer } from '../impl/tradeBuffer.js'
import type { MarketTrade, TradeDataSource, TradeFrame } from '../types.js'

const instrument: InstrumentDescriptor = {
  id: 'binance:spot:BTCUSDT',
  sourceId: 'binance',
  symbol: 'BTCUSDT',
  name: 'BTC / USDT',
  assetClass: 'crypto',
  exchange: 'BINANCE',
  tickSize: 0.01,
  capabilities: { trades: { raw: true, live: true } },
}
const trade = (tradeId: string, timestamp: number): MarketTrade => ({
  tradeId,
  timestamp,
  price: '100.01',
  size: '0.1',
  side: 'buy',
})

/** 夹具只实现公开 Provider 契约，所有断言针对真实 Buffer 状态。 */
function fixture() {
  let listener: ((frame: TradeFrame) => void) | null = null
  const close = vi.fn()
  const source: TradeDataSource = {
    async fetch({ range }) {
      return { range, complete: true, items: [trade('1', 1100), trade('2', 1500)] }
    },
    connect() {
      return {
        subscribe(next) {
          listener = next
          return () => {
            listener = null
          }
        },
        close,
      }
    },
  }
  return {
    source,
    close,
    emit(frame: TradeFrame) {
      listener?.(frame)
    },
  }
}

describe('TradeBuffer', () => {
  it('reports missing price precision instead of downloading trades that cannot be rendered', async () => {
    const f = fixture()
    const fetch = vi.spyOn(f.source, 'fetch')
    const buffer = createTradeBuffer(f.source, { ...instrument, tickSize: undefined })
    await buffer.ensureRange({ from: 1000, to: 2000 })
    expect(buffer.snapshot.peek().status).toBe('error')
    expect(buffer.snapshot.peek().message).toContain('tickSize')
    expect(fetch).not.toHaveBeenCalled()
    buffer.dispose()
  })
  // 连接后的尾部由 SSE 负责，移动时钟和重复检查需求不会不断拉取 REST 尾段。
  it('does not poll REST for the connected realtime tail', async () => {
    const f = fixture()
    const fetch = vi.fn<TradeDataSource['fetch']>(async ({ range }) => ({
      range,
      complete: true,
      items: [],
    }))
    f.source.fetch = fetch
    const buffer = createTradeBuffer(f.source, instrument)
    vi.spyOn(Date, 'now').mockReturnValue(120_000)
    try {
      f.emit({ type: 'status', code: 'CONNECTED' })
      await buffer.ensureRange({ from: 60_000, to: 120_000 })
      await buffer.ensureRange({ from: 60_000, to: 121_000 })
      await buffer.ensureRange({ from: 60_000, to: 122_000 })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch.mock.calls[0]?.[0].range).toEqual({ from: 60_000, to: 120_000 })
    } finally {
      vi.restoreAllMocks()
      buffer.dispose()
    }
  })
  // 缩放或往返滚动命中已有覆盖时，不重复访问 Provider。
  it('reuses cached coverage when zooming and revisiting a range', async () => {
    const f = fixture()
    const fetch = vi.spyOn(f.source, 'fetch')
    const buffer = createTradeBuffer(f.source, instrument)
    await buffer.ensureRange({ from: 1000, to: 2000 })
    await buffer.ensureRange({ from: 1200, to: 1800 })
    await buffer.ensureRange({ from: 1000, to: 2000 })
    expect(fetch).toHaveBeenCalledTimes(1)
    buffer.dispose()
  })

  // 大范围按分钟顺序补页，扩大只补新增左区间，历史查询不延伸到现在。
  it('pages only missing viewport intervals in requests of at most one minute', async () => {
    const f = fixture()
    const ranges: { from: number; to: number }[] = []
    f.source.fetch = async ({ range }) => {
      ranges.push(range)
      return { range, complete: true, items: [] }
    }
    const buffer = createTradeBuffer(f.source, instrument)
    await buffer.ensureRange({ from: 60_000, to: 180_000 })
    expect(ranges).toEqual([
      { from: 120_000, to: 180_000 },
      { from: 60_000, to: 120_000 },
    ])
    await buffer.ensureRange({ from: 0, to: 180_000 })
    expect(ranges[2]).toEqual({ from: 0, to: 60_000 })
    await buffer.ensureRange({ from: 70_000, to: 150_000 })
    expect(ranges).toHaveLength(3)
    buffer.dispose()
  })

  // 失败页按稳定分钟身份保存，to 随时钟微移和重连不能形成重试风暴。
  it('does not retry a failed page on gestures or connection status', async () => {
    const f = fixture()
    const fetch = vi
      .fn<TradeDataSource['fetch']>()
      .mockRejectedValue(new Error('成交范围超过 250000 笔'))
    f.source.fetch = fetch
    const buffer = createTradeBuffer(f.source, instrument)
    await buffer.ensureRange({ from: 60_000, to: 100_000 })
    await buffer.ensureRange({ from: 65_000, to: 101_000 })
    await buffer.ensureRange({ from: 60_000, to: 100_000 })
    f.emit({ type: 'status', code: 'CONNECTED' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(buffer.snapshot.peek().status).toBe('error')
    buffer.dispose()
  })

  // 手势改变时复用在途请求；迟到但有效的覆盖允许缓存，不取消后重新下载。
  it('keeps a single in-flight request while viewport demand changes', async () => {
    const f = fixture()
    let release: (() => void) | undefined
    let aborted = false
    const fetch = vi.fn<TradeDataSource['fetch']>(
      ({ range, signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true
          })
          release = () => resolve({ range, complete: true, items: [] })
        }),
    )
    f.source.fetch = fetch
    const buffer = createTradeBuffer(f.source, instrument)
    const first = buffer.ensureRange({ from: 60_000, to: 120_000 })
    const second = buffer.ensureRange({ from: 70_000, to: 110_000 })
    expect(fetch).toHaveBeenCalledTimes(1)
    release?.()
    await Promise.all([first, second])
    expect(aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    buffer.dispose()
  })
  // 自动跟随向右移动会回收屏外逐笔，避免长时间运行累计整个交易日的原始数据。
  it('evicts trades before the retained viewport boundary', async () => {
    const f = fixture()
    const buffer = createTradeBuffer(f.source, instrument)
    await buffer.ensureRange({ from: 1000, to: 2000 })
    buffer.retainFrom(1400)
    expect(buffer.snapshot.peek().batches[0]?.range.from).toBe(1400)
    expect(
      buffer.snapshot
        .peek()
        .batches.flatMap((batch) => batch.items)
        .map((item) => item.tradeId),
    ).toEqual(['2'])
    buffer.dispose()
  })
  // 实时重放历史中的 tradeId，不应把同一成交计入两次。
  it('deduplicates overlapping trades and publishes a whole realtime batch', async () => {
    const f = fixture()
    const buffer = createTradeBuffer(f.source, instrument)
    await buffer.ensureRange({ from: 1000, to: 2000 })
    f.emit({ type: 'trades', trades: [trade('2', 1500), trade('3', 2100), trade('4', 2200)] })
    expect(
      buffer.snapshot
        .peek()
        .batches.flatMap((batch) => batch.items)
        .map((item) => item.tradeId),
    ).toEqual(['1', '2', '3', '4'])
    expect(buffer.snapshot.peek().batches).toHaveLength(2)
    buffer.dispose()
    expect(f.close).toHaveBeenCalledOnce()
  })

  // 断线追加缺口区间，但已经确认的历史柱不失去完整性。
  it('marks the disconnected tail without invalidating confirmed history', async () => {
    const f = fixture()
    const buffer = createTradeBuffer(f.source, instrument)
    await buffer.ensureRange({ from: 1000, to: 2000 })
    f.emit({ type: 'status', code: 'DISCONNECTED', complete: false })
    expect(buffer.snapshot.peek().status).toBe('gap')
    expect(buffer.snapshot.peek().batches[0]?.complete).toBe(true)
    expect(buffer.snapshot.peek().batches[1]?.complete).toBe(false)
    expect(buffer.snapshot.peek().batches[1]?.range.from).toBe(2000)
    buffer.dispose()
  })

  // 切换或删除指标时取消请求，迟到结果不得进入快照。
  it('cancels outstanding history on disposal', async () => {
    const f = fixture()
    let aborted = false
    f.source.fetch = ({ signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => {
          aborted = true
          reject(new Error('cancelled'))
        }),
      )
    const buffer = createTradeBuffer(f.source, instrument)
    const loading = buffer.ensureRange({ from: 1000, to: 2000 })
    buffer.dispose()
    await loading
    expect(aborted).toBe(true)
    expect(buffer.snapshot.peek().batches).toHaveLength(0)
  })
})
