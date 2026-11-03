/** 确定性行情：只依赖包的公开类型，不 import 仓库内任何模块。 */

import type {
  BarsObserver,
  DataSourceInstrument,
  KLineData,
  MarketDataSource,
} from '@363045841yyt/klinechart'
import { InstrumentType, KLineAdjustment, KLinePeriod } from '@363045841yyt/klinechart'

/** 生成固定 160 根日线，保证截图与断言可复现。 */
export function createChartData(): KLineData[] {
  const start = Date.parse('2026-01-01T00:00:00Z')
  const day = 86_400_000
  const data: KLineData[] = []
  let previousClose = 96

  for (let index = 0; index < 160; index += 1) {
    const drift = index * 0.22
    const wave = Math.sin(index / 5) * 3.2
    const close = Number((96 + drift + wave).toFixed(2))
    const open = previousClose
    const high = Number((Math.max(open, close) + 1.1 + (index % 4) * 0.18).toFixed(2))
    const low = Number((Math.min(open, close) - 0.9 - (index % 3) * 0.16).toFixed(2))
    data.push({
      timestamp: start + index * day,
      open,
      high,
      low,
      close,
      volume: 1_200_000 + index * 18_500 + (index % 7) * 72_000,
    })
    previousClose = close
  }

  return data
}

/** 固定行情通过注册数据源查询；页面只消费公开的行情契约。 */
export function createMockDataSource(onSubscriptionChange?: (active: number) => void) {
  const bars = createChartData()
  const observers = new Set<BarsObserver>()
  const instrument: DataSourceInstrument = {
    id: 'BTCUSDT',
    symbol: 'BTCUSDT',
    name: 'Bitcoin / Tether consumer fixture',
    exchange: 'MOCK',
    instrumentType: InstrumentType.Crypto,
    sessionId: 'CN',
    timezone: 'Asia/Shanghai',
    capabilities: {
      bars: { periods: [KLinePeriod.Daily], adjustments: [KLineAdjustment.None] },
      liveBars: true,
    },
  }
  const source: MarketDataSource = {
    id: 'consumer-fixture',
    name: 'Consumer market data',
    capabilities: {
      instrumentTypes: [InstrumentType.Crypto],
      bars: { periods: [KLinePeriod.Daily], adjustments: [KLineAdjustment.None] },
      liveBars: true,
    },
    instruments: {
      async search(query) {
        query.signal?.throwIfAborted()
        return instrument.symbol.includes(query.keyword.toUpperCase()) ||
          instrument.name.includes(query.keyword)
          ? [instrument]
          : []
      },
      async resolve(id, signal) {
        signal.throwIfAborted()
        if (id !== instrument.id) throw new Error(`Unknown instrument: ${id}`)
        return instrument
      },
    },
    bars: {
      async fetch(request) {
        request.signal.throwIfAborted()
        const available = bars.filter(
          (bar) => request.beforeTimestamp === undefined || bar.timestamp < request.beforeTimestamp,
        )
        return {
          bars: available.slice(-request.limit),
          olderData: available.length > request.limit ? 'available' : 'exhausted',
        }
      },
      subscribe(_request, observer) {
        observers.add(observer)
        onSubscriptionChange?.(observers.size)
        observer.status('connected')
        return () => {
          observers.delete(observer)
          onSubscriptionChange?.(observers.size)
        }
      },
    },
  }
  return { source, instrument: { sourceId: source.id, id: instrument.id } }
}
