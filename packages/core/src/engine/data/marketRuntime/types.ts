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

export interface MarketRuntimeDependencies {
  readonly cache: MarketDataCache
  readonly session: ReadonlySignal<ReadyMarketSession | null>
  readonly visibleRange: ReadonlySignal<VisibleRange>
  readonly data: ReadonlySignal<ReadonlyArray<KLineData | TimeShareData>>
  needsTrades(): boolean
  publishTrades(snapshot: TradeSnapshot): void
  writeBars(session: ReadyMarketSession, bars: readonly KLineData[]): void
}
