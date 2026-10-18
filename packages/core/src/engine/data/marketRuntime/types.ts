/** 活动行情就绪快照与订阅运行模块的依赖契约。 */

import type { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import type { BarsSelection } from '@/data/buffer/impl/seriesRepository.js'
import type { InstrumentDescriptor, SourceCapabilities } from '@/data/provider/types.js'
import type { TradeSnapshot } from '@/data/trades/types.js'
import type { VisibleRange } from '@/engine/viewport/viewport.js'
import type { ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { KLineData, TimeShareData } from '@/foundation/types/price.js'

/** 已确认来源且已加载首批 K 线的活动行情；null 表示尚未就绪或非 K 线视图。 */
export interface ReadyMarketSession {
  readonly selection: BarsSelection
  readonly instrument: InstrumentDescriptor
  readonly capabilities: SourceCapabilities
}

/**
 * 会话与品种是否同时声明支持原始实时成交流。
 *
 * 能力位判断只此一处：成交流订阅和有无原始逐笔成交的显示模式判断共用同一份规则。
 *
 * @param session - 已就绪的活动行情
 * @returns 会话源、品种原始成交与实时流三项能力是否齐备
 */
export function supportsRawTradeStream(session: ReadyMarketSession): boolean {
  const { instrument } = session
  return Boolean(
    session.capabilities.trades?.live &&
      instrument.capabilities.trades?.raw &&
      instrument.capabilities.trades.live,
  )
}

export interface MarketRuntimeDependencies {
  resolveBarsSelection(
    instrument: InstrumentDescriptor,
    period: BarsSelection['period'],
    adjustment: BarsSelection['adjustment'],
    aggregation: BarsSelection['barAggregation'],
  ): BarsSelection
  invalidateRequests?(): void
  readonly registry?: import('@/data/provider/impl/registry.js').MarketDataProviderRegistry
  readonly cache: MarketDataCache
  readonly session: ReadonlySignal<ReadyMarketSession | null>
  readonly visibleRange: ReadonlySignal<VisibleRange>
  readonly data: ReadonlySignal<ReadonlyArray<KLineData | TimeShareData>>
  needsTrades(): boolean
  publishTrades(snapshot: TradeSnapshot): void
  writeBars(session: ReadyMarketSession, bars: readonly KLineData[]): void
}
