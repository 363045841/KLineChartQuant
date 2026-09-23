import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('does not reuse primary data across unified markets', async () => {
    let fetchCount = 0
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            fetchCount++
            return makeBarsPage([makeKLine(Date.now())], {
              instrumentId: 'test:000001',
              olderData: 'unknown',
            })
          },
        },
      }),
    )
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager
    manager.setSymbols([
      {
        symbol: '000001',
        market: 'CN',
        period: 'daily',
        source: 'test',
        instrument: { ...instrumentFor('000001'), id: 'test:CN:000001' },
      },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    manager.setSymbols([
      {
        symbol: '000001',
        market: 'HK',
        period: 'daily',
        source: 'test',
        instrument: { ...instrumentFor('000001'), id: 'test:HK:000001', sessionId: 'HK' },
      },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    expect(fetchCount).toBe(2)
  })

  it('schedules a draw after timeshare data finishes loading', async () => {
    const scheduleDraw = vi.fn()
    const harness = createTestChartDataManager(document, {
      viewport: { scrollLeft: 800 },
      scheduleDraw,
    })
    manager = harness.manager
    registerTestProvider(
      createTestProvider({
        fetchTimeShare: async () => ({
          instrumentId: 'test:000001',
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 9.5,
          data: [{ timestamp: 1, price: 10, average: 10 }],
        }),
      }),
    )

    manager.setSymbols([
      {
        symbol: '000001',
        market: 'CN',
        period: 'timeshare',
        source: 'test',
        instrument: instrumentFor('000001'),
      },
    ])

    await vi.waitFor(() => expect(harness.dataState.readonly.data.peek()).toHaveLength(1))
    expect(scheduleDraw).toHaveBeenCalled()
  })

  it('requests and displays a distinct cache entry for each selected timeshare date', async () => {
    const harness = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } })
    manager = harness.manager
    const fetchTimeShare = vi.fn(async ({ tradingDate }: { tradingDate: string }) => ({
      instrumentId: 'test:000001',
      tradingDate: tradingDate as '2026-08-05' | '2026-08-06',
      timezone: 'Asia/Shanghai',
      preClose: 9.5,
      data: [
        {
          timestamp: tradingDate === '2026-08-05' ? 1 : 2,
          price: tradingDate === '2026-08-05' ? 10 : 11,
          average: tradingDate === '2026-08-05' ? 10 : 11,
        },
      ],
    }))
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          fetch: async () => makeBarsPage([makeKLine(0)], { instrumentId: 'test:000001' }),
        },
        fetchTimeShare,
      }),
    )
    manager.setSymbols([makeTestSymbolSpec('000001')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    manager.setTimeShareQueryDate(20260805)
    manager.setCurrentPeriod('timeshare')
    await vi.waitFor(() => expect(harness.dataState.readonly.data.peek()[0]?.timestamp).toBe(1))

    manager.setTimeShareQueryDate(20260806)
    manager.setCurrentPeriod('timeshare')
    await vi.waitFor(() => expect(harness.dataState.readonly.data.peek()[0]?.timestamp).toBe(2))

    expect(fetchTimeShare).toHaveBeenCalledTimes(2)
    expect(fetchTimeShare).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tradingDate: '2026-08-05' }),
    )
    expect(fetchTimeShare).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tradingDate: '2026-08-06' }),
    )
  })

  it('loads five-day timeshare through the range Provider and stores the grouped snapshot', async () => {
    const harness = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } })
    manager = harness.manager
    const fetchTimeShareRange = vi.fn(async () => ({
      instrumentId: 'test:000001',
      timezone: 'Asia/Shanghai',
      requestedDays: 5,
      olderData: 'unknown' as const,
      days: [
        {
          tradingDate: '2026-08-05' as const,
          preClose: 9.5,
          data: [{ timestamp: 1, price: 10, average: 10 }],
        },
        {
          tradingDate: '2026-08-06' as const,
          preClose: 10,
          data: [{ timestamp: 2, price: 11, average: 11 }],
        },
      ],
    }))
    registerTestProvider(createTestProvider({ fetchTimeShareRange }))

    manager.setSymbols([
      makeTestSymbolSpec('000001', {
        period: '5daytimeshare',
        instrument: {
          ...instrumentFor('000001'),
          capabilities: { timeShare: true, timeShareRange: { maxTradingDays: 5 } },
        },
      }),
    ])

    await vi.waitFor(() =>
      expect(harness.dataState.readonly.timeShareRange.peek()?.days).toHaveLength(2),
    )
    expect(fetchTimeShareRange).toHaveBeenCalledWith(
      expect.objectContaining({ endTradingDate: expect.any(String), days: 5 }),
    )
    expect(harness.dataState.readonly.data.peek()).toHaveLength(2)
    expect(harness.dataState.readonly.timeShareRange.peek()?.days[1]?.preClose).toBe(10)
  })

  it('keeps custom source data isolated from a Provider with the same label', async () => {
    const providerData = makeKLine(2)
    const fetchBars = vi.fn(async () =>
      makeBarsPage([providerData], { instrumentId: 'test:000001' }),
    )
    registerTestProvider(createTestProvider({ fetchBars: { fetch: fetchBars } }))
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager

    manager.applyCustomData({
      market: 'CN',
      symbol: '000001',
      source: 'test',
      data: [makeKLine(1)],
    })
    expect(manager.getData()[0]?.timestamp).toBe(1)

    manager.resetToFetcher({
      market: 'CN',
      symbol: '000001',
      period: 'daily',
      adjust: 'none',
      source: 'test',
      instrument: instrumentFor('000001'),
    })

    await vi.waitFor(() => expect(manager!.getData()[0]?.timestamp).toBe(2))
    expect(fetchBars).toHaveBeenCalledOnce()
  })

  it('mirrors active buffer lastError onto dataError', async () => {
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            throw new Error('[gotdx] stock/kline-by-date failed: 500')
          },
        },
      }),
    )
    manager = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } }).manager
    manager.setSymbols([makeTestSymbolSpec('158017')])

    await vi.waitFor(
      () =>
        expect(manager!.dataError.peek()).toBe(
          '[test] Error: [gotdx] stock/kline-by-date failed: 500',
        ),
      { timeout: 10_000 },
    )
  }, 15_000)
})
