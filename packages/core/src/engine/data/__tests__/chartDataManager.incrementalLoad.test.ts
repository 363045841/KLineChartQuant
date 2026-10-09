/** ChartDataManager 左侧增量加载测试：历史回补、游标推进、提示刷新与并发去重。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
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
})
