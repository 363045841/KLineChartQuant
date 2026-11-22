/** 覆盖加载契约：一次声明下界，数据层负责翻页、守卫、耗尽与序列切换。 */
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

describe('ChartDataManager coverage', () => {
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

  /**
   * 按游标切片、每页最多 `pageSize` 根的日线源。
   *
   * 短页是数据源的常态（连接器有单请求上限），覆盖循环必须继续请求，不能把第一页当成全部。
   */
  function dailySource(
    dataset: readonly number[],
    olderDataFor: (page: number) => 'available' | 'exhausted' = () => 'available',
    pageSize = 2,
  ) {
    let page = 0
    const fetch = vi.fn(async (query: { beforeTimestamp?: number; limit: number }) => {
      const items = dataset
        .filter(
          (timestamp) => query.beforeTimestamp === undefined || timestamp < query.beforeTimestamp,
        )
        .slice(-Math.min(query.limit, pageSize))
        .map(makeKLine)
      const result = makeBarsPage(items, { olderData: olderDataFor(page) })
      page += 1
      return result
    })
    registerTestProvider(createTestProvider({ fetchBars: { fetch } }))
    return fetch
  }

  it.each([
    ['a covered lower bound', (start: number) => start, 'covered'],
    ['a negative infinite lower bound', () => Number.NEGATIVE_INFINITY, 'exhausted'],
  ] as const)('loads pages serially until %s is resolved', async (_label, bound, expected) => {
    const start = Date.now() - 6 * MS_PER_DAY
    const dataset = Array.from({ length: 6 }, (_, index) => start + index * MS_PER_DAY)
    const fetch = dailySource(dataset, (page) => (page < 3 ? 'available' : 'exhausted'))
    manager = createTestChartDataManager(document).manager
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000'))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    await expect(manager.ensureCoverageFrom(bound(start))).resolves.toBe(expected)
    expect(manager.getData().map((bar) => bar.timestamp)).toEqual(dataset)
    // 每次请求都以上一页最早时间为游标，严格向前推进。
    const cursors = fetch.mock.calls.map(([query]) => query.beforeTimestamp)
    expect(cursors[0]).toBeUndefined()
    expect(cursors.slice(1).every((cursor) => cursor !== undefined)).toBe(true)
  })

  it('reports exhaustion without requesting past a source that is already at its end', async () => {
    const start = Date.now() - MS_PER_DAY
    const fetch = dailySource([start, start + MS_PER_DAY], () => 'exhausted', 500)
    manager = createTestChartDataManager(document).manager
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000'))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    const initialCalls = fetch.mock.calls.length

    await expect(manager.ensureCoverageFrom(start - 30 * MS_PER_DAY)).resolves.toBe('exhausted')

    expect(fetch.mock.calls.length).toBe(initialCalls)
  })

  it('stops when a page brings no new history', async () => {
    const start = Date.now() - MS_PER_DAY
    const samePage = vi.fn(async () => makeBarsPage([makeKLine(start)], { olderData: 'available' }))
    registerTestProvider(createTestProvider({ fetchBars: { fetch: samePage } }))
    manager = createTestChartDataManager(document).manager
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000'))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    await expect(manager.ensureCoverageFrom(start - 10 * MS_PER_DAY)).resolves.toBe('exhausted')
    expect(samePage.mock.calls.length).toBe(2)
  })

  it('shares one loop between concurrent requests of the same series', async () => {
    const start = Date.now() - 4 * MS_PER_DAY
    const dataset = Array.from({ length: 4 }, (_, index) => start + index * MS_PER_DAY)
    dailySource(dataset)
    manager = createTestChartDataManager(document).manager
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000'))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    const first = manager.ensureCoverageFrom(start)
    const second = manager.ensureCoverageFrom(start)

    expect(first).toBe(second)
    await expect(first).resolves.toBe('covered')
    expect(manager.getData()[0]?.timestamp).toBe(start)
  })

  it('abandons the loop when the active series changes', async () => {
    const start = Date.now() - MS_PER_DAY
    let release!: (value: TestBarSeries) => void
    let page = 0
    const fetch = vi.fn(async () => {
      page += 1
      if (page === 1) return makeBarsPage([makeKLine(start)], { olderData: 'available' })
      return new Promise<TestBarSeries>((resolve) => {
        release = resolve
      })
    })
    registerTestProvider(createTestProvider({ fetchBars: { fetch } }))
    manager = createTestChartDataManager(document).manager
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000'))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    const pending = manager.ensureCoverageFrom(start - 10 * MS_PER_DAY)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000', { period: 'weekly' }))
    release(makeBarsPage([makeKLine(start - MS_PER_DAY)], { olderData: 'exhausted' }))

    await expect(pending).resolves.toBe('superseded')
  })

  it('keeps the viewport prefetch as a single-page caller of the same loop', async () => {
    const start = Date.now() - 100 * MS_PER_DAY
    const fetch = dailySource(
      Array.from({ length: 100 }, (_, index) => start + index * MS_PER_DAY),
      () => 'available',
      500,
    )
    const harness = createTestChartDataManager(document, {
      viewport: { scrollLeft: 0, visibleRange: { start: 0, end: 2 } },
    })
    manager = harness.manager
    manager.setPrimaryMarket(makeTestSymbolSpec('sh.600000'))
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    const initialCalls = fetch.mock.calls.length

    harness.scrollTo(100)
    manager.checkVisibleRangeGap()
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    expect(fetch.mock.calls.length).toBe(initialCalls + 1)
  })
})
