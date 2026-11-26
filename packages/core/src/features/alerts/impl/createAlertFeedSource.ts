/**
 * 警报行情源：按启用规则订阅任意品种，把历史与实时尾部合并成计算中枢的 feed。
 *
 * 收盘以行情流的 `closed` 帧为准；订阅释放时同时归还计算中枢的行情。
 */
import type { SymbolSpec } from '../../../controllers/types.js'
import { MarketDataCache } from '../../../data/buffer/impl/marketDataCache.js'
import { instrumentKeyFromSpec, SERIES_SELECTION_KIND } from '../../../data/buffer/impl/seriesRepository.js'
import type { MarketDataProviderRegistry } from '../../../data/provider/impl/registry.js'
import { ORIGINAL_BAR_AGGREGATION, isKLineAdjustment, isKLinePeriod } from '../../../data/provider/types.js'
import type { StreamHub } from '../../../data/stream/types.js'
import { type CalculationHub, createFeedKey, type FeedKey } from '../../../engine/calculation/index.js'
import type { ReadyMarketSession } from '../../../engine/data/marketRuntime/types.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { alertFeedIdentity } from './alertSymbol.js'

const HISTORY_LIMIT = 500

export interface AlertFeedLease {
  retain(symbols: readonly SymbolSpec[]): void
  dispose(): void
}

interface AlertFeedSourceDependencies {
  readonly hub: CalculationHub
  readonly registry: MarketDataProviderRegistry
  readonly stream: StreamHub
  onError(symbol: SymbolSpec, error: unknown): void
}

export function createAlertFeedSource(deps: AlertFeedSourceDependencies): AlertFeedLease {
  const cache = new MarketDataCache(deps.registry)
  const feeds = new Map<FeedKey, () => void>()
  let revision = 0
  let disposed = false

  function open(symbol: SymbolSpec, key: FeedKey): () => void {
    const identity = alertFeedIdentity(symbol)
    const { period, adjustment } = identity
    const { instrument } = symbol
    if (!isKLinePeriod(period) || !isKLineAdjustment(adjustment))
      throw new TypeError(`Invalid bar request for ${instrument.symbol}`)
    const request = Object.freeze({
      source: instrument.source,
      period,
      adjustment,
      barAggregation: ORIGINAL_BAR_AGGREGATION,
    })
    const capabilities = deps.registry.get(instrument.source)?.source.capabilities
    if (!capabilities) throw new Error(`Unknown market source ${instrument.source}`)
    const marketSession: ReadyMarketSession = {
      instrument,
      capabilities,
      selection: { ...request, kind: SERIES_SELECTION_KIND.bars, instrumentKey: instrumentKeyFromSpec(symbol) },
    }
    const subscription = deps.stream.subscribe({ ...request, channel: 'bars', instrumentId: instrument.id })
    let bars: KLineData[] = []
    /** 第一根实时 bar 的时间；其后的历史回放不能覆盖实时值。 */
    let liveSince: number | undefined
    let lastClosedTime: number | undefined
    let loading = false
    let stopped = false

    /** 有界窗口：历史合并与实时尾部共用同一上限。 */
    function trim(): void {
      if (bars.length > HISTORY_LIMIT) bars = bars.slice(-HISTORY_LIMIT)
    }

    function publish(start: number, live = false, closedBarTime?: number): void {
      if (stopped || bars.length === 0) return
      deps.hub.updateFeed({
        identity,
        dataRevision: ++revision,
        marketRevision: 0,
        timestamps: bars.map((bar) => bar.timestamp),
        data: bars,
        change: { start, end: bars.length },
        live,
        ordered: true,
        marketSession,
        ...(closedBarTime === undefined ? {} : { closedBarTime }),
      })
    }

    function mergeHistory(history: readonly KLineData[]): void {
      const merged = new Map(bars.map((bar) => [bar.timestamp, bar]))
      for (const bar of history) {
        if (liveSince !== undefined && bar.timestamp >= liveSince) continue
        merged.set(bar.timestamp, bar)
      }
      bars = [...merged.values()].sort((a, b) => a.timestamp - b.timestamp)
      trim()
      publish(0)
    }

    async function loadHistory(): Promise<void> {
      if (loading) return
      loading = true
      try {
        const { series } = await cache.queryBars({
          ...request,
          instrument,
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          instrumentType: instrument.instrumentType,
          limit: HISTORY_LIMIT,
        })
        if (!stopped) mergeHistory(series.data)
      } catch (error) {
        if (!stopped) deps.onError(symbol, error)
      } finally {
        loading = false
      }
    }

    const unsubscribeFrame = subscription.onFrame((frame) => {
      if (stopped) return
      if (frame.type === 'snapshot') {
        mergeHistory(frame.bars)
        return
      }
      if (frame.type !== 'bar') return
      const bar = frame.bar
      const last = bars.at(-1)
      const isTail = last === undefined || bar.timestamp >= last.timestamp
      const index = isTail
        ? bar.timestamp === last?.timestamp ? bars.length - 1 : bars.length
        : bars.findIndex((item) => item.timestamp === bar.timestamp)
      if (index < 0) return
      bars = [...bars.slice(0, index), bar, ...bars.slice(index + 1)]
      liveSince = liveSince === undefined ? bar.timestamp : Math.min(liveSince, bar.timestamp)
      const dropped = Math.max(0, bars.length - HISTORY_LIMIT)
      trim()
      const closesBar = frame.state === 'closed' && (lastClosedTime === undefined || bar.timestamp > lastClosedTime)
      if (closesBar) lastClosedTime = bar.timestamp
      publish(Math.max(0, index - dropped), isTail, closesBar ? bar.timestamp : undefined)
    })
    const unsubscribeEvent = subscription.onEvent((event) => {
      if (event.kind === 'opened' && event.reconnected) void loadHistory()
    })
    void loadHistory()

    return () => {
      stopped = true
      unsubscribeFrame()
      unsubscribeEvent()
      subscription.close()
      deps.hub.removeFeed(key)
    }
  }

  function stop(key: FeedKey): void {
    const disposeFeed = feeds.get(key)
    feeds.delete(key)
    disposeFeed?.()
  }

  return {
    retain(symbols) {
      if (disposed) return
      const wanted = new Set<FeedKey>()
      for (const symbol of symbols) {
        const key = createFeedKey(alertFeedIdentity(symbol))
        wanted.add(key)
        if (feeds.has(key)) continue
        try {
          feeds.set(key, open(symbol, key))
        } catch (error) {
          deps.onError(symbol, error)
        }
      }
      for (const key of feeds.keys()) if (!wanted.has(key)) stop(key)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const key of feeds.keys()) stop(key)
      cache.destroy()
    },
  }
}
