/** 行情管理实例隔离、共享连接与异步失效测试。 */
import { describe, expect, it, vi } from 'vitest'
import { DataBuffer } from '../../buffer/impl/dataBuffer.js'
import { MarketDataCache } from '../../buffer/impl/marketDataCache.js'
import type { BarsSelection } from '../../buffer/impl/seriesRepository.js'
import { createDataSourceFixture } from '../../provider/__tests__/helpers/providerTestKit.js'
import { searchInstruments } from '../../provider/impl/instrumentSearch.js'
import { createBuiltinMarketDataContext } from '../../provider/impl/sources/createBuiltinContext.js'
import type { MarketDataProvider, SourceProbeResult } from '../../provider/types.js'
import { MarketDataContext } from '../impl/context.js'

/** 最小协议 Provider，只模拟场景涉及的网络边界。 */
function provider(
  id: string,
  probe: MarketDataProvider['probe'] = async () => ({ status: 'online', checkedAt: 1 }),
): MarketDataProvider {
  return {
    source: {
      id,
      displayName: id,
      connectionId: 'shared',
      defaultBaseUrl: 'http://localhost:8000',
    },
    probe,
    catalog: { search: vi.fn().mockResolvedValue([]) },
  }
}

describe('MarketDataContext', () => {
  it('releases a host subscription that disconnects synchronously during creation', async () => {
    const fixture = createDataSourceFixture([])
    const stop = vi.fn()
    fixture.source.bars.subscribe = (_request, observer) => {
      observer.status('disconnected')
      return stop
    }
    const context = new MarketDataContext()
    try {
      context.registerDataSource(fixture.source)
      const instrument = await context.resolveInstrument('test', 'A')
      await context.health.refresh()
      const handle = context.realtime.subscribe({
        sourceId: 'test',
        instrumentId: instrument.id,
        channel: 'bars',
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
      })
      await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
      handle.close()
    } finally {
      context.dispose()
    }
    expect(stop).toHaveBeenCalledOnce()
  })

  it('owns stream lifetime and keeps healthy connections during health refresh', async () => {
    const fixture = createDataSourceFixture([])
    const context = new MarketDataContext()
    context.registerDataSource(fixture.source)
    const instrument = await context.resolveInstrument('test', 'A')
    await context.health.refresh()
    const handle = context.realtime.subscribe({
      sourceId: 'test',
      instrumentId: instrument.id,
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
    })
    const frames = vi.fn()
    handle.onFrame(frames)
    await vi.waitFor(() => expect(fixture.observers.size).toBe(1))
    const observer = fixture.observers.get('A')!
    await context.health.refresh({ force: true })
    await Promise.resolve()
    expect(fixture.observers.get('A')).toBe(observer)
    expect(fixture.stopped).toEqual([])
    context.dispose()
    expect(fixture.observers.size).toBe(0)
    expect(fixture.stopped).toEqual(['A'])
    frames.mockClear()
    observer.invalidate()
    expect(frames).not.toHaveBeenCalled()
    expect(() =>
      context.realtime.subscribe({ sourceId: 'test', instrumentId: 'A', channel: 'quotes' }),
    ).toThrow('disposed')
  })

  it('drops old connection snapshots while retaining unrelated data', () => {
    const context = new MarketDataContext()
    context.registry.register(provider('one'))
    const other = provider('other')
    context.registry.register({ ...other, source: { ...other.source, connectionId: 'other' } })
    const cache = new MarketDataCache(context.registry)
    const selection: BarsSelection = {
      kind: 'bars',
      instrumentKey: 'stock',
      sourceId: 'one',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
    }
    const unrelated = { ...selection, sourceId: 'other' }
    cache.repository.getOrCreateBars(selection, () => new DataBuffer())
    const retained = cache.repository.getOrCreateBars(unrelated, () => new DataBuffer())
    context.applyConnection('shared', 'http://localhost:9000')
    expect(cache.repository.getBars(selection)).toBeUndefined()
    expect(cache.repository.getBars(unrelated)).toBe(retained)
    cache.destroy()
    context.dispose()
  })

  it('times out providers that ignore cancellation', async () => {
    vi.useFakeTimers()
    const context = new MarketDataContext()
    try {
      context.registry.register(provider('one', () => new Promise(() => {})))
      const pending = context.health.refresh()
      await vi.advanceTimersByTimeAsync(5000)
      await pending
      expect(context.health.state.peek().one?.status).toBe('offline')
    } finally {
      context.dispose()
      vi.useRealTimers()
    }
  })
  it('shares connection configuration within an instance and isolates hosts', () => {
    const first = createBuiltinMarketDataContext()
    const second = createBuiltinMarketDataContext()
    first.applyConnection('baostock-tradingview', 'http://localhost:9000')
    expect(first.registry.getConfig('baostock').baseUrl).toBe('http://localhost:9000')
    expect(first.registry.getConfig('tradingview').baseUrl).toBe('http://localhost:9000')
    expect(second.registry.getConfig('baostock').baseUrl).toBeUndefined()
    first.dispose()
    second.dispose()
  })

  it('applies search and route policy independently', async () => {
    const context = new MarketDataContext()
    const item = provider('one')
    context.registry.register(item)
    context.registry.setConfig('one', { enabled: false })
    await searchInstruments(context.registry, { keyword: 'test', limit: 10 })
    expect(item.catalog?.search).toHaveBeenCalledOnce()
    context.registry.setConfig('one', { enabled: true, searchEnabled: false })
    await searchInstruments(context.registry, { keyword: 'test', limit: 10 })
    expect(item.catalog?.search).toHaveBeenCalledOnce()
    expect(context.registry.getEnabled()).toEqual([item])
    context.dispose()
  })

  it('rejects incomplete URLs before changing configuration', () => {
    const context = new MarketDataContext()
    context.registry.register(provider('one'))
    expect(() => context.applyConnection('shared', 'http://')).toThrow()
    expect(context.registry.getConnection('one').version).toBe(0)
    context.dispose()
  })

  it('deduplicates simultaneous probes and ignores results from old connections', async () => {
    const context = new MarketDataContext()
    let resolveOld: ((result: SourceProbeResult) => void) | undefined
    const probe = vi
      .fn<MarketDataProvider['probe']>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValue({ status: 'online', checkedAt: 2 })
    context.registry.register(provider('one', probe))
    const old = context.health.refresh()
    const duplicate = context.health.refresh()
    await Promise.resolve()
    expect(probe).toHaveBeenCalledOnce()
    context.applyConnection('shared', 'http://localhost:9000')
    await context.health.refresh()
    resolveOld?.({ status: 'offline', checkedAt: 1 })
    await Promise.all([old, duplicate])
    expect(context.health.state.peek().one?.status).toBe('online')
    expect(context.health.state.peek().one?.connectionVersion).toBe(1)
    context.dispose()
  })
})
