/**
 * 警报行情订阅：把统一行情服务的序列送入计算中枢。
 *
 * 本文件只做投影，不查询历史、不订阅流、不维护第二份 K 线。
 */
import type { SymbolSpec } from '@/foundation/types/instrument.js'
import { DATA_CHANGE_KINDS } from '@/data/buffer/types.js'
import type { MarketDataProviderRegistry } from '@/data/provider/registry.js'
import { ORIGINAL_BAR_AGGREGATION } from '@/data/provider/types.js'
import {
  type BarsSeries,
  type MarketDataService,
  resolveBarsSelection,
} from '@/data/service/index.js'
import type { CalculationHub, FeedKey } from '@/engine/calculation/index.js'
import { createFeedKey } from '@/engine/calculation/index.js'
import type { ReadyMarketSession } from '@/engine/data/series/types.js'
import { alertFeedIdentity } from './alertSymbol.js'

/** 警报历史窗口；与计算无关，只决定首屏可用范围。 */
const HISTORY_LIMIT = 500

/** 警报只要求“按品种维持订阅”，不暴露序列实现。 */
export interface AlertFeedLease {
  retain(symbols: readonly SymbolSpec[]): void
  dispose(): void
}

interface AlertFeedDependencies {
  readonly data: MarketDataService
  readonly hub: CalculationHub
  readonly registry: MarketDataProviderRegistry
  onError(symbol: SymbolSpec, error: unknown): void
}

/** 创建警报行情订阅；同一品种的规则共用一条序列。 */
export function createAlertFeeds(deps: AlertFeedDependencies): AlertFeedLease {
  const feeds = new Map<FeedKey, () => void>()
  let revision = 0
  let disposed = false

  /** 订阅一个品种，并把它投影成计算中枢的 feed。 */
  function open(symbol: SymbolSpec, key: FeedKey): () => void {
    const identity = alertFeedIdentity(symbol)
    const capabilities = deps.registry.get(symbol.instrument.source)?.source.capabilities
    if (!capabilities) throw new Error(`Unknown market source ${symbol.instrument.source}`)
    const session: ReadyMarketSession = {
      instrument: symbol.instrument,
      capabilities,
      selection: resolveBarsSelection(symbol, ORIGINAL_BAR_AGGREGATION),
    }
    const series: BarsSeries = deps.data.bars(symbol, {
      aggregation: ORIGINAL_BAR_AGGREGATION,
      initialBars: HISTORY_LIMIT,
    })
    let lastClosedTime: number | undefined

    /** 只发布已经提交的快照；收线时刻由序列的收盘标记给出。 */
    const publish = (): void => {
      if (disposed) return
      const change = series.data.peek()
      const bars = change.data
      const last = bars[bars.length - 1]
      if (last === undefined) return
      let closedBarTime: number | undefined
      if (series.lastBarClosed.peek() && last.timestamp !== lastClosedTime) {
        lastClosedTime = last.timestamp
        closedBarTime = last.timestamp
      }
      deps.hub.updateFeed({
        identity,
        dataRevision: ++revision,
        marketRevision: 0,
        timestamps: bars.map((bar) => bar.timestamp),
        data: bars,
        change: {
          start: change.start,
          end: change.end,
          reset:
            change.kind === DATA_CHANGE_KINDS.replace ||
            change.kind === DATA_CHANGE_KINDS.prepend,
        },
        live:
          change.kind === DATA_CHANGE_KINDS.append || change.kind === DATA_CHANGE_KINDS.tail,
        ordered: true,
        marketSession: session,
        ...(closedBarTime === undefined ? {} : { closedBarTime }),
      })
    }

    const unsubscribe = series.data.subscribe(publish)
    publish()
    return () => {
      unsubscribe()
      series.dispose()
      deps.hub.removeFeed(key)
    }
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
      for (const [key, dispose] of [...feeds]) {
        if (wanted.has(key)) continue
        dispose()
        feeds.delete(key)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const dispose of feeds.values()) dispose()
      feeds.clear()
    },
  }
}
