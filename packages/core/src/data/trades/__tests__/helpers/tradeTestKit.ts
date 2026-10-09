/** 成交链路测试夹具：真实仓库、缓存、存储与计算，仅 Provider 按公开契约提供确定的成交记录。 */
import { vi } from 'vitest'
import { MarketDataCache } from '../../../buffer/impl/marketDataCache.js'
import {
  SERIES_SELECTION_KIND,
  type TradesSelection,
} from '../../../buffer/impl/seriesRepository.js'
import { MarketDataProviderRegistry } from '../../../provider/impl/registry.js'
import type { InstrumentDescriptor } from '../../../provider/types.js'
import type { MarketTrade, TradeDataSource } from '../../types.js'

export const tradeInstrument: InstrumentDescriptor = {
  id: 'binance:spot:BTCUSDT',
  sourceId: 'binance',
  symbol: 'BTCUSDT',
  name: 'BTC / USDT',
  assetClass: 'crypto',
  exchange: 'BINANCE',
  tickSize: 0.01,
  capabilities: { trades: { raw: true, live: true } },
}
export const tradeSelection: TradesSelection = {
  kind: SERIES_SELECTION_KIND.trades,
  instrumentKey: tradeInstrument.id,
  sourceId: tradeInstrument.sourceId,
}

/** 构造不同身份的成交，同毫秒成交共享时间但不共享身份。 */
export function marketTrade(tradeId: string, timestamp: number, price = '100.01'): MarketTrade {
  return { tradeId, timestamp, price, size: '0.1', side: 'buy' }
}

/** 使用完整范围 Provider 驱动真实缓存，调用方只声明成交记录或在途请求差异。 */
export function createTradeCache(
  records: readonly MarketTrade[],
  fetch?: TradeDataSource['fetch'],
) {
  const registry = new MarketDataProviderRegistry()
  const fetchRange = vi.fn<TradeDataSource['fetch']>(
    fetch ??
      (async ({ range }) => ({
        range,
        complete: true,
        items: records.filter(
          (trade) => trade.timestamp >= range.from && trade.timestamp < range.to,
        ),
      })),
  )
  registry.register({
    source: {
      id: tradeInstrument.sourceId,
      displayName: 'Binance',
      capabilities: { assetClasses: ['crypto'], trades: { raw: true, live: true } },
    },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: { search: async () => [tradeInstrument] },
    trades: { fetch: fetchRange, connect: () => ({ subscribe: () => () => {}, close: () => {} }) },
  })
  const cache = new MarketDataCache(registry)
  const buffer = cache.getTradeBuffer(tradeSelection, tradeInstrument)
  return {
    cache,
    buffer,
    fetch: fetchRange,
    query(range: { from: number; to: number }, signal?: AbortSignal) {
      return cache.queryTrades({
        selection: tradeSelection,
        instrument: tradeInstrument,
        range,
        signal,
      })
    },
    emit(trades: readonly MarketTrade[]) {
      cache.acceptTradeFrame(tradeSelection, tradeInstrument, { type: 'trades', trades })
    },
  }
}
