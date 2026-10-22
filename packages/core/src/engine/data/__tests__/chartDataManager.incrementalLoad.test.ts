/** ChartDataManager 左侧增量加载测试：历史回补、游标推进、提示刷新与并发去重。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMarketDataProvider } from '@/data/provider/protocol/impl/provider'
import type { MarketDataTransport } from '@/data/provider/protocol/types'

import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  instrumentFor,
  MS_PER_DAY,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  type TestBarSeries,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

describe('ChartDataManager incremental load', () => {
  let manager: ChartDataManager | null = null
  let document: Document

  beforeEach(() => {
    document = createTestDocument()
  })

  afterEach(() => {
    manager?.destroy()
    manager = null
    unregisterTestProvider()
    vi.unstubAllGlobals()
  })

  // 源级单页能力约束旧品种快照；短页继续推进真实游标，直到源明确声明耗尽。
  it('continues protocol-limited pages without treating the first short page as exhausted', async () => {
    const instrument = instrumentFor('sh.600000')
    const start = Date.now() - 6 * MS_PER_DAY
    const dataset = Array.from({ length: 6 }, (_, index) => makeKLine(start + index * MS_PER_DAY))
    const maxBarsPerRequest = 2
    const fetchBars = vi.fn<MarketDataTransport['fetchBars']>(async (query) => {
      if (query.limit > maxBarsPerRequest) {
        throw new Error('transport request exceeds source capability')
      }
      const items = dataset
        .filter(
          (bar) => query.beforeTimestamp === undefined || bar.timestamp < query.beforeTimestamp,
        )
        .slice(-query.limit)
      return {
        instrumentId: instrument.id,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        timezone: 'Asia/Shanghai',
        items,
        olderData: items[0] === dataset[0] ? 'exhausted' : 'available',
      }
    })
    const provider = createMarketDataProvider({
      source: { id: 'test', displayName: 'Test' },
      transport: {
        probe: async () => ({
          status: 'online',
          checkedAt: 1,
          capabilities: {
            assetClasses: ['stock'],
            bars: { periods: ['daily'], adjustments: ['none'], maxBarsPerRequest },
          },
        }),
        searchInstruments: async () => ({ items: [instrument] }),
        fetchBars,
        fetchTimeShare: async () => {
          throw new Error('time share is not declared')
        },
      },
    })
    await provider.probe()
    registerTestProvider(provider)
    manager = createTestChartDataManager(document, {
      viewport: { scrollLeft: 0 },
      onBarsReady: () => manager?.checkVisibleRangeGap(),
    }).manager
    manager.setSymbols([makeTestSymbolSpec(instrument.symbol)])

    await vi.waitFor(() => expect(manager!.getData()).toHaveLength(dataset.length))
    expect(fetchBars).toHaveBeenCalledTimes(3)
    expect(fetchBars.mock.calls.map(([query]) => query.limit)).toEqual([2, 2, 2])
    expect(fetchBars.mock.calls.map(([query]) => query.beforeTimestamp)).toEqual([
      undefined,
      dataset[4]!.timestamp,
      dataset[2]!.timestamp,
    ])
    expect(manager.getData().map((bar) => bar.timestamp)).toEqual(
      dataset.map((bar) => bar.timestamp),
    )
    expect(manager.dataBuffer.olderData).toBe('exhausted')
    manager.checkVisibleRangeGap()
    expect(fetchBars).toHaveBeenCalledTimes(3)
  })

  it('loads history when the left buffer is visible, regardless of the raw index range', async () => {
    const start = Date.now() - 100 * MS_PER_DAY
    const fetchBars = vi.fn(async (query: { beforeTimestamp?: number }) =>
      makeBarsPage(
        query.beforeTimestamp === undefined
          ? Array.from({ length: 100 }, (_, index) => makeKLine(start + index * MS_PER_DAY))
          : [makeKLine(start - MS_PER_DAY)],
        { olderData: query.beforeTimestamp === undefined ? 'available' : 'exhausted' },
      ),
    )
    registerTestProvider(createTestProvider({ fetchBars: { fetch: fetchBars } }))
    const harness = createTestChartDataManager(document, {
      viewport: { scrollLeft: 800, visibleRange: { start: 10, end: 30 } },
    })
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    harness.scrollTo(799)
    manager.checkVisibleRangeGap()
    manager.checkVisibleRangeGap()

    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    expect(fetchBars).toHaveBeenCalledTimes(2)
    expect(fetchBars).toHaveBeenLastCalledWith(expect.objectContaining({ beforeTimestamp: start }))
    manager.checkVisibleRangeGap()
    expect(fetchBars).toHaveBeenCalledTimes(2)
  })

  it('continues from a progressed page until the provider reports exhaustion', async () => {
    const start = Date.now() - 100 * MS_PER_DAY
    const fetchBars = vi.fn(async (query: { beforeTimestamp?: number }) =>
      makeBarsPage(
        query.beforeTimestamp === undefined
          ? [makeKLine(start), makeKLine(start + MS_PER_DAY)]
          : [makeKLine(query.beforeTimestamp - MS_PER_DAY)],
        {
          olderData:
            query.beforeTimestamp === start
              ? 'available'
              : query.beforeTimestamp === undefined
                ? 'available'
                : 'exhausted',
        },
      ),
    )
    registerTestProvider(createTestProvider({ fetchBars: { fetch: fetchBars } }))
    const harness = createTestChartDataManager(document, {
      viewport: { scrollLeft: 0, visibleRange: { start: 0, end: 2 } },
      onBarsReady: () => manager?.checkVisibleRangeGap(),
    })
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])

    await vi.waitFor(() => expect(fetchBars).toHaveBeenCalledTimes(3))
    expect(manager.dataBuffer.olderData).toBe('exhausted')
    manager.checkVisibleRangeGap()
    expect(fetchBars).toHaveBeenCalledTimes(3)
  })

  it('flushes the first prepend hint when loading becomes idle', async () => {
    const now = Date.now()
    const initialStart = now - 365 * MS_PER_DAY
    let fetchCount = 0
    let olderPageCursor: number | undefined
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch(query) {
            fetchCount++
            if (fetchCount === 2) olderPageCursor = query.beforeTimestamp
            return makeBarsPage(
              fetchCount === 1
                ? [makeKLine(initialStart), makeKLine(now)]
                : [makeKLine(initialStart - 90 * MS_PER_DAY)],
              { olderData: fetchCount === 1 ? 'available' : 'exhausted' },
            )
          },
        },
      }),
    )
    const harness = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } })
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])

    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    expect(harness.dataState.readonly.loading.peek()).toBe(false)

    manager.ensureDataRange(initialStart - 30 * MS_PER_DAY)

    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    await vi.waitFor(() => {
      expect(harness.dataState.readonly.loading.peek()).toBe(false)
      expect(harness.dataManagerState.readonly.pendingIncrementalLoad.peek().count).toBe(0)
    })
    expect(fetchCount).toBe(2)
    expect(olderPageCursor).toBe(initialStart)
    expect(manager.getData()[0]?.timestamp).toBe(initialStart - 90 * MS_PER_DAY)
  })

  it('does not queue duplicate history merges while one page is loading', async () => {
    const now = Date.now()
    const initialStart = now - 365 * MS_PER_DAY
    let fetchCount = 0
    let resolveOlder!: (value: TestBarSeries) => void
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            fetchCount++
            if (fetchCount === 1) {
              return makeBarsPage([makeKLine(initialStart), makeKLine(now)], {
                olderData: 'available',
              })
            }
            return new Promise((resolve) => {
              resolveOlder = resolve
            })
          },
        },
      }),
    )
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    let dataEvents = 0
    const unsubscribe = manager.dataBuffer.data.subscribe(() => dataEvents++)
    manager.ensureDataRange(initialStart - MS_PER_DAY)
    manager.ensureDataRange(initialStart - MS_PER_DAY)
    await vi.waitFor(() => expect(fetchCount).toBe(2))
    resolveOlder(makeBarsPage([makeKLine(initialStart - 90 * MS_PER_DAY)]))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    unsubscribe()

    expect(dataEvents).toBe(1)
    expect(fetchCount).toBe(2)
  })
})
