/** ChartDataManager 分时加载测试：单日/五日分时请求、查询日期缓存与重绘调度。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TradingDate } from '@/data/provider/types'
import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

describe('ChartDataManager time share', () => {
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

    // 激活空 Buffer 本身会触发一次重绘，这里只断言数据到达后又调度了新的重绘。
    const drawsBeforeData = scheduleDraw.mock.calls.length
    await vi.waitFor(() => expect(harness.dataState.readonly.data.peek()).toHaveLength(1))
    expect(scheduleDraw.mock.calls.length).toBeGreaterThan(drawsBeforeData)
  })

  it('requests and displays a distinct cache entry for each selected timeshare date', async () => {
    const harness = createTestChartDataManager(document, { viewport: { scrollLeft: 800 } })
    manager = harness.manager
    const fetchTimeShare = vi.fn(async ({ tradingDate }: { tradingDate: TradingDate }) => ({
      instrumentId: 'test:000001',
      tradingDate,
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
})
