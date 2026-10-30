/** Deterministic chart data used only by the Electron E2E build mode. */
import type { KLineData } from '@363045841yyt/klinechart-core/controllers'
import type { BarsObserver, DataSourceInstrument, MarketDataSource } from '@363045841yyt/klinechart-core/market-data'

export function createE2eChartData(): KLineData[] {
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

/** 固定行情也通过注册数据源查询；测试控件与订阅复用同一份行情事实。 */
export function createE2eDataSource(onSubscriptionChange?: (active: number) => void) {
  let bars = createE2eChartData()
  const observers = new Set<BarsObserver>()
  const metrics = { historyRequests: 0, subscriptions: 0, unsubscriptions: 0 }
  const instrument: DataSourceInstrument = {
    id: 'BTCUSDT', symbol: 'BTCUSDT', name: 'Bitcoin / Tether E2E fixture',
    exchange: 'MOCK', assetClass: 'crypto', sessionId: 'CN', timezone: 'Asia/Shanghai',
    capabilities: { bars: { periods: ['daily'], adjustments: ['none'] }, liveBars: true },
  }
  const source: MarketDataSource = {
    id: 'e2e-fixture', name: 'Acceptance market data',
    capabilities: { assetClasses: ['crypto'], bars: { periods: ['daily'], adjustments: ['none'] }, liveBars: true },
    instruments: {
      async search(query) {
        query.signal?.throwIfAborted()
        return instrument.symbol.includes(query.keyword.toUpperCase()) || instrument.name.includes(query.keyword) ? [instrument] : []
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
        metrics.historyRequests++
        const available = bars.filter((bar) => request.beforeTimestamp === undefined || bar.timestamp < request.beforeTimestamp)
        return { bars: available.slice(-request.limit), olderData: available.length > request.limit ? 'available' : 'exhausted' }
      },
      subscribe(_request, observer) {
        metrics.subscriptions++
        observers.add(observer)
        onSubscriptionChange?.(observers.size)
        observer.status('connected')
        return () => {
          if (observers.delete(observer)) metrics.unsubscriptions++
          onSubscriptionChange?.(observers.size)
        }
      },
    },
  }
  return { source, instrument: { sourceId: source.id, id: instrument.id }, metrics,
    /** 改写权威末根并发送一根增量，既不调用图表，也不重发历史数组。 */
    updateLastBar() {
      const last = bars.at(-1)!
      const bar = { ...last, close: last.close + 1, high: Math.max(last.high, last.close + 1) }
      bars = [...bars.slice(0, -1), bar]
      for (const observer of observers) observer.update(bar)
    },
    /** 追加一个周期并通知订阅，覆盖追加而非整体替换。 */
    appendBar() {
      const last = bars.at(-1)!
      const bar = { ...last, timestamp: last.timestamp + 86_400_000 }
      bars = [...bars, bar]
      for (const observer of observers) observer.update(bar)
    },
  }
}
