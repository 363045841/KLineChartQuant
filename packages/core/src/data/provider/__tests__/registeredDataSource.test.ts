/** 公开注册入口贯通真实缓存与行情运行时，合并验证分页、增量语义和取消边界。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketDataContext } from '../../management/impl/context.js'
import { createDataSourceFixture } from './helpers/providerTestKit.js'
import {
  createTestChartDataManager, createTestDocument, makeKLine,
} from '../../../engine/data/__tests__/helpers/chartDataManagerTestKit.js'
import type { HistoryPage } from '../types.js'

/** 各场景共用来源、真实管理器与唯一资源释放操作。 */
function setup(realtime = true) {
  const bars = [100, 200, 300].map((timestamp) => makeKLine(timestamp))
  const fixture = createDataSourceFixture(bars, realtime)
  const host = new MarketDataContext()
  const unregister = host.registerDataSource(fixture.source)
  const { manager } = createTestChartDataManager(createTestDocument(), {
    marketDataProviderRegistry: host.registry, viewport: { scrollLeft: 800 },
  })
  /** 选择稳定品种，经解析后的标准身份进入既有取数链路。 */
  async function select(id: string) {
    const instrument = await host.resolveInstrument('test', id)
    manager.setSymbols([{ symbol: instrument.symbol, instrument, market: 'CN', period: 'daily', source: 'test' }])
    await vi.waitFor(() => {
      expect(manager.getData()).toHaveLength(3)
      expect(manager.dataBuffer.loading.peek()).toBe(false)
    })
    return instrument
  }
  return { fixture, bars, host, unregister, manager, select,
    dispose() { manager.destroy(); host.dispose() },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('registered data source', () => {
  it('shares paged history, tail updates, explicit corrections and subscription lifetime through the Provider pipeline', async () => {
    const harness = setup()
    const { host, fixture, bars, manager } = harness
    try {
      const instrument = await host.resolveInstrument('test', 'A')
      const query = { sourceId: 'test', instrument, symbol: 'A', period: 'daily', adjustment: 'none', barAggregation: 'original', limit: 2 } satisfies Parameters<typeof manager.marketDataCache.queryBars>[0]
      expect((await manager.marketDataCache.queryBars(query)).series.data.map((bar) => bar.timestamp)).toEqual([200, 300])
      expect((await manager.marketDataCache.queryBars({ ...query, beforeTimestamp: 200 })).series.data.map((bar) => bar.timestamp)).toEqual([100])
      expect(fixture.requests).toHaveLength(2)
      await harness.select('A')
      const observer = fixture.observers.get('A')!
      const fetches = fixture.requests.length
      const last = bars[2]!
      const updated = { ...last, close: last.close + 1, high: last.high + 1 }
      observer.update(updated)
      expect(manager.getData()).toHaveLength(3)
      expect(manager.getData()[2]?.close).toBe(updated.close)
      observer.update({ ...updated, timestamp: 400 })
      expect(manager.getData()).toHaveLength(4)
      expect(fixture.requests).toHaveLength(fetches)

      const corrected = { ...bars[0]!, close: bars[0]!.close + 1, high: bars[0]!.high + 1 }
      observer.update(corrected)
      expect(manager.dataBuffer.lastError.peek()).toContain('historical: true')
      expect(manager.getData()[0]?.close).toBe(bars[0]!.close)
      observer.update(corrected, { historical: true })
      expect(manager.getData()[0]?.close).toBe(corrected.close)
      const cached = await manager.marketDataCache.queryBars({ ...query, limit: 4 })
      expect(cached.series.data[0]?.close).toBe(corrected.close)
      expect(fixture.requests).toHaveLength(fetches)

      await harness.select('B')
      expect(fixture.stopped).toContain('A')
      observer.update({ ...updated, timestamp: 500 })
      expect(manager.getData()).toHaveLength(3)
      harness.unregister()
      expect(fixture.stopped).toContain('B')
      expect(host.registry.get('test')).toBeUndefined()
    } finally { harness.dispose() }
  })

  it('replays updates over delayed history and cancels late callbacks and queries on unregister', async () => {
    const harness = setup()
    const { fixture, bars, manager } = harness
    try {
      await harness.select('A')
      const observer = fixture.observers.get('A')!
      let complete: ((page: HistoryPage) => void) | undefined
      let requestSignal: AbortSignal | undefined
      fixture.source.bars.fetch = async (request) => {
        requestSignal = request.signal
        return new Promise<HistoryPage>((resolve) => { complete = resolve })
      }
      observer.invalidate()
      await vi.waitFor(() => expect(complete).toBeDefined())
      const updated = { ...bars[2]!, high: bars[2]!.high + 3, close: bars[2]!.close + 3 }
      observer.update(updated)
      complete!({ bars, olderData: 'exhausted' })
      await vi.waitFor(() => expect(manager.getData()[2]?.close).toBe(updated.close))
      const instrument = await harness.host.resolveInstrument('test', 'A')
      expect((await manager.marketDataCache.queryBars({ sourceId: 'test', instrument, symbol: 'A', exchange: instrument.exchange, assetClass: instrument.assetClass, period: 'daily', adjustment: 'none', barAggregation: 'original', limit: 3 })).series.data[2]?.close).toBe(updated.close)

      complete = undefined
      observer.invalidate()
      await vi.waitFor(() => expect(complete).toBeDefined())
      harness.unregister()
      expect(requestSignal?.aborted).toBe(true)
      complete!({ bars, olderData: 'exhausted' })
      observer.update(updated)
      expect(fixture.observers.size).toBe(0)
    } finally { harness.dispose() }
  })

  it('accepts historical-only sources without creating a stream', async () => {
    const harness = setup(false)
    try {
      await harness.select('A')
      expect(harness.fixture.observers.size).toBe(0)
      expect(harness.host.registry.get('test')?.liveBars).toBeUndefined()
      expect(harness.fixture.requests).toHaveLength(1)
      harness.fixture.source.bars.fetch = async () => ({ bars: [makeKLine(200), makeKLine(100)], olderData: 'exhausted' })
      await expect(harness.host.registry.getRequired('test').bars!.fetch({
        instrument: await harness.host.resolveInstrument('test', 'A'), period: 'daily', adjustment: 'none',
        barAggregation: 'original', limit: 3,
      })).rejects.toThrow('ordered, unique')
    } finally { harness.dispose() }
  })
})
