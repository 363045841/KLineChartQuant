/** 指标行情需求协调器：组合需求生命周期、历史加载和脚本数据投影。 */
import {
  type Bar,
  type IndicatorBarsRequest,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import type { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import { seriesSelectionKey } from '@/data/buffer/impl/seriesRepository.js'
import type { KLineBuffer } from '@/data/buffer/types.js'
import type { MarketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { KLINE_PERIODS } from '@/data/provider/types.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { MarketRuntimeDependencies, ReadyMarketSession } from '../types.js'
import { IndicatorBarsDemandRegistry, waitForDemand } from './indicatorBarsDemand.js'
import { loadIndicatorBars } from './indicatorBarsLoader.js'
import { marketClock, projectIndicatorBars } from './indicatorBarsProjector.js'
import { assertSecurityPeriod, requestPeriod } from './requestPeriod.js'

interface Dependencies {
  readonly cache: MarketDataCache
  readonly registry: MarketDataProviderRegistry
  readonly sessions: MarketSessionRegistry
  current(): ReadyMarketSession | null
  readonly resolveSelection: MarketRuntimeDependencies['resolveBarsSelection']
  bind(owners: ReadonlySet<string>, target: ReadyMarketSession, buffer: KLineBuffer): void
}

export class IndicatorBarsRepository {
  private readonly demands = new IndicatorBarsDemandRegistry()
  /** 注入共享行情基础设施。 */
  constructor(private readonly deps: Dependencies) {}

  /** 对齐完整使用者快照。 */
  retain(owners: ReadonlySet<string>): void {
    this.demands.retain(owners)
  }

  /** 释放当前会话的全部请求。 */
  clear(): void {
    this.demands.clear()
  }

  /** 获取共享请求，补齐范围后返回脚本只读数据。 */
  async read(
    owner: string,
    bars: readonly KLineData[],
    request: IndicatorBarsRequest,
    session: ReadyMarketSession | null,
    signal?: AbortSignal,
  ): Promise<readonly Bar[]> {
    signal?.throwIfAborted()
    if (!session || this.deps.current() !== session)
      throw new Error('Request 没有有效的图表行情会话')
    if (!bars.length) return []
    const period = requestPeriod(request.timeframe)
    if (request.mode !== 'lower_tf') assertSecurityPeriod(period, session.selection.period)
    if (
      request.mode === 'lower_tf' &&
      KLINE_PERIODS.indexOf(period) > KLINE_PERIODS.indexOf(session.selection.period)
    ) {
      if (request.ignore_invalid_timeframe) return []
      throw new TypeError('security_lower_tf的周期不能高于主图')
    }
    const from = bars[0]!.timestamp
    const to = bars[bars.length - 1]!.timestamp
    const source = request.source ?? session.instrument.sourceId
    const key = JSON.stringify([
      seriesSelectionKey(session.selection),
      source,
      request.symbol,
      period,
      request.mode ?? 'security',
      request.calcBarsCount,
    ])
    const owners = new Set([owner])
    for (;;) {
      const demand = this.demands.acquire(key, { owners, session, from, to }, (created) =>
        loadIndicatorBars(this.deps, created, request, period),
      )
      if (demand.target && demand.buffer)
        this.deps.bind(demand.owners, demand.target, demand.buffer)
      await waitForDemand(demand.ready, signal)
      signal?.throwIfAborted()
      demand.abort.signal.throwIfAborted()
      if (this.deps.current() !== session) throw new Error('Request 图表会话已切换')
      if (!this.demands.isCurrent(key, demand)) continue
      if (!demand.buffer) return []
      const clock = marketClock(session, this.deps.sessions)
      const targetOpen = clock ? timeValue(clock, 'open', period, to) : to
      const needsHistory = from < demand.from
      const needsTail =
        to > demand.to && (demand.buffer.getRawData().at(-1)?.timestamp ?? -Infinity) < targetOpen
      if (needsHistory || needsTail) {
        for (const id of demand.owners) owners.add(id)
        this.demands.delete(key)
        continue
      }
      if (demand.target) this.deps.bind(demand.owners, demand.target, demand.buffer)
      return projectIndicatorBars(demand.buffer, request, session, clock, to)
    }
  }
}
