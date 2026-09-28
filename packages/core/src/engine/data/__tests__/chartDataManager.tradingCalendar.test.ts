import { afterEach, describe, expect, it, vi } from 'vitest'
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
} from './helpers/chartDataManagerTestKit.js'

describe('V1 trading calendar labels', () => {
  afterEach(() => {
    unregisterTestProvider()
    vi.unstubAllGlobals()
  })

  it('without a declared calendar capability, future slots remain unlabeled', async () => {
    registerTestProvider(
      createTestProvider({
        fetchBars: { fetch: async () => makeBarsPage([makeKLine(100)]) },
      }),
    )
    const manager = createTestChartDataManager(createTestDocument(), {
      viewport: { visibleRange: { start: 0, end: 3 } },
    }).manager
    try {
      manager.setSymbols([makeTestSymbolSpec('sh.600000')])
      await vi.waitFor(() => expect(manager.dataBuffer.getRawData()).toHaveLength(1))
      expect(manager.getAxisTimestampAtLogicalIndex(1)).toBeNull()
    } finally {
      manager.destroy()
    }
  })

  it('requests the selected source with the last bar timestamp and visible slot count', async () => {
    const fetch = vi.fn(async ({ anchorTimestamp }: { anchorTimestamp: number }) => ({
      anchorTimestamp,
      futureTimestamps: [200, 300],
    }))
    registerTestProvider(
      createTestProvider({
        fetchBars: { fetch: async () => makeBarsPage([makeKLine(100)]) },
        fetchTradingCalendar: fetch,
      }),
    )
    const manager = createTestChartDataManager(createTestDocument(), {
      viewport: { visibleRange: { start: 0, end: 3 } },
    }).manager
    try {
      manager.setSymbols([
        makeTestSymbolSpec('sh.600000', {
          instrument: {
            ...instrumentFor('sh.600000'),
            capabilities: { ...instrumentFor('sh.600000').capabilities, tradingCalendar: true },
          },
        }),
      ])
      await vi.waitFor(() => expect(manager.dataBuffer.getRawData()).toHaveLength(1))
      expect(manager.getAxisTimestampAtLogicalIndex(1)).toBeNull()
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
      expect(fetch).toHaveBeenCalledWith(
        expect.objectContaining({ anchorTimestamp: 100, count: 2, period: 'daily' }),
      )
      await vi.waitFor(() => expect(manager.getAxisTimestampAtLogicalIndex(1)).toBe(200))
      expect(manager.getTimestampAtLogicalIndex(1)).toBeNull()
      expect(manager.getAxisTimestampAtLogicalIndex(3)).toBeNull()
    } finally {
      manager.destroy()
    }
  })
})
