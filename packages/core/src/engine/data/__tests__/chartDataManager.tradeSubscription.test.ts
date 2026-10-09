/** 验证成交订阅等待正式行情来源，并在重复视口协调时保持唯一连接。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarsCacheResult } from '@/data/buffer/impl/marketDataCache.js'
import type { InstrumentDescriptor } from '@/data/provider/types.js'
import type { TradeDataSource } from '@/data/trades/types.js'
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

describe('ChartDataManager trade subscription', () => {
  afterEach(() => {
    unregisterTestProvider()
    vi.restoreAllMocks()
  })

  // 目录精度和正式行情精度不一致时，也只能连接正式来源一次。
  it.each(['test', 'auto'])(
    'keeps one connection after resolving %s and moving the view',
    async (source) => {
      const instrument: InstrumentDescriptor = {
        ...instrumentFor('sh.600000'),
        tickSize: 0.01,
        capabilities: {
          ...instrumentFor('sh.600000').capabilities,
          trades: { raw: true, live: true },
        },
      }
      const close = vi.fn()
      const connect = vi.fn<TradeDataSource['connect']>(() => ({
        subscribe: () => () => {},
        close,
      }))
      const trades: TradeDataSource = {
        connect,
        fetch: async ({ range }) => ({ range, items: [], complete: true }),
      }
      const provider = createTestProvider({})
      registerTestProvider({
        ...provider,
        source: {
          ...provider.source,
          capabilities: {
            ...provider.source.capabilities,
            assetClasses: ['stock'],
            trades: { raw: true, live: true },
          },
        },
        trades,
      })
      const { manager, scrollTo } = createTestChartDataManager(createTestDocument(), {
        viewport: { visibleRange: { start: 0, end: 2 } },
        needsTrades: () => true,
        updateTradeInput: () => {},
      })
      let finishLoad: ((result: BarsCacheResult) => void) | undefined
      vi.spyOn(manager.marketDataCache, 'queryBars').mockImplementation(
        () =>
          new Promise<BarsCacheResult>((resolve) => {
            finishLoad = resolve
          }),
      )
      try {
        manager.setSymbols([
          makeTestSymbolSpec('sh.600000', {
            source,
            instrument: { ...instrument, tickSize: 0.1 },
          }),
        ])
        manager.reconcileTradeInput()
        expect(connect).not.toHaveBeenCalled()
        const page = makeBarsPage([makeKLine(100), makeKLine(200)])
        expect(finishLoad).toBeDefined()
        finishLoad?.({
          sourceId: 'test',
          instrument,
          series: { ...page, barAggregation: 'original' },
        })
        await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
        expect(connect).toHaveBeenCalledWith(instrument)
        for (const scrollLeft of [100, 200, 300]) {
          scrollTo(scrollLeft)
          manager.reconcileTradeInput()
        }
        expect(connect).toHaveBeenCalledTimes(1)
        expect(close).not.toHaveBeenCalled()
      } finally {
        manager.destroy()
      }
      expect(close).toHaveBeenCalledTimes(1)
    },
  )
})
