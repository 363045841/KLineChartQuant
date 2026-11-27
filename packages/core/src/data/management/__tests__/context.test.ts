// @vitest-environment jsdom
/** 行情管理实例隔离、共享连接与异步失效测试。 */
import { describe, expect, it, vi } from 'vitest'
import { DataBuffer } from '../../buffer/impl/dataBuffer.js'
import { MarketDataCache } from '../../buffer/impl/marketDataCache.js'
import type { BarsSelection } from '../../buffer/seriesSelection.js'
import { searchInstruments } from '../../provider/instrumentSearch.js'
import { createBuiltinMarketDataContext } from '../../provider/impl/sources/createBuiltinContext.js'
import type { MarketDataProvider, SourceProbeResult } from '../../provider/types.js'
import type { StreamFrame, StreamTransportHandlers } from '../../stream/types.js'
import { MarketDataContext } from '../context.js'

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

/** 注册一个可观察的流式数据源；传输替身记录建流与关闭次数。 */
function registerStreamSource(context: MarketDataContext) {
  const transports: Array<StreamTransportHandlers & { closed: number }> = []
  context.registry.register({
    source: { id: 'one', displayName: 'one', defaultBaseUrl: 'http://localhost:8000' },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    stream: (_request, created) => {
      const transport = Object.assign(created, { closed: 0 })
      transports.push(transport)
      return {
        open() {},
        close() {
          transport.closed += 1
        },
      }
    },
  })
  return transports
}

describe('MarketDataContext stream lifecycle', () => {
  it('routes transport frames to the subscription and closes on the last leave', () => {
    const context = new MarketDataContext()
    try {
      const transports = registerStreamSource(context)
      const frames: StreamFrame[] = []
      const handle = context.stream.subscribe({
        source: 'one',
        channel: 'quotes',
        instrumentId: 'A',
      })
      handle.onFrame((frame) => frames.push(frame))
      expect(transports).toHaveLength(1)
      transports[0]!.onFrame({
        seq: 0,
        ts: 0,
        type: 'quote',
        instrumentId: 'A',
        quote: { last: 1, prevClose: 1, timestamp: 0 },
      })
      expect(frames).toHaveLength(1)
      handle.close()
      expect(transports[0]!.closed).toBe(1)
    } finally {
      context.dispose()
    }
    expect(() =>
      context.stream.subscribe({ source: 'one', instrumentId: 'A', channel: 'quotes' }),
    ).toThrow('disposed')
  })

  it.each([
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['pageshow', () => window.dispatchEvent(new Event('pageshow'))],
    ['online', () => window.dispatchEvent(new Event('online'))],
  ])('resumes a backing-off stream on %s', (_name, fire) => {
    const context = new MarketDataContext()
    try {
      const transports = registerStreamSource(context)
      const handle = context.stream.subscribe({
        source: 'one',
        channel: 'quotes',
        instrumentId: 'A',
      })
      transports[0]!.onOpen()
      transports[0]!.onClose({ retryable: true, message: 'lost' })
      fire()
      expect(transports).toHaveLength(2)
      handle.close()
    } finally {
      context.dispose()
    }
  })

  it('leaves a live stream untouched when the page becomes active again', () => {
    const context = new MarketDataContext()
    try {
      const transports = registerStreamSource(context)
      const handle = context.stream.subscribe({
        source: 'one',
        channel: 'quotes',
        instrumentId: 'A',
      })
      transports[0]!.onOpen()
      document.dispatchEvent(new Event('visibilitychange'))
      expect(transports).toHaveLength(1)
      expect(transports[0]!.closed).toBe(0)
      handle.close()
    } finally {
      context.dispose()
    }
  })

  it('detaches the page restore listeners on dispose', () => {
    const documentRemove = vi.spyOn(document, 'removeEventListener')
    const windowRemove = vi.spyOn(window, 'removeEventListener')
    try {
      new MarketDataContext().dispose()
      expect(documentRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(windowRemove).toHaveBeenCalledWith('pageshow', expect.any(Function))
      expect(windowRemove).toHaveBeenCalledWith('online', expect.any(Function))
    } finally {
      documentRemove.mockRestore()
      windowRemove.mockRestore()
    }
  })
})

describe('MarketDataContext', () => {
  it('drops old connection snapshots while retaining unrelated data', () => {
    const context = new MarketDataContext()
    context.registry.register(provider('one'))
    const other = provider('other')
    context.registry.register({ ...other, source: { ...other.source, connectionId: 'other' } })
    const cache = new MarketDataCache(context.registry)
    const selection: BarsSelection = {
      kind: 'bars',
      instrumentKey: 'stock',
      source: 'one',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
    }
    const unrelated = { ...selection, source: 'other' }
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
