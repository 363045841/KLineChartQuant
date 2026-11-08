/** 指标行情加载器：负责实时共享 Buffer 的绑定、历史分页和并发合并。 */
import {
  DEFAULT_INTRABAR_LIMIT,
  DEFAULT_REQUEST_BARS,
  type IndicatorBarsRequest,
  type ScriptTimeContext,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import { DataBuffer } from '@/data/buffer/impl/dataBuffer.js'
import type { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import type { KLineBuffer } from '@/data/buffer/types.js'
import type { MarketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { type KLinePeriod, OLDER_DATA_STATUS } from '@/data/provider/types.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { MarketRuntimeDependencies, ReadyMarketSession } from '../types.js'
import type { IndicatorBarsDemand } from './indicatorBarsDemand.js'
import { marketClock } from './indicatorBarsProjector.js'

interface Dependencies {
  readonly cache: MarketDataCache
  readonly registry: MarketDataProviderRegistry
  readonly sessions: MarketSessionRegistry
  current(): ReadyMarketSession | null
  readonly resolveSelection: MarketRuntimeDependencies['resolveBarsSelection']
  bind(owners: ReadonlySet<string>, target: ReadyMarketSession, buffer: KLineBuffer): void
}

type HistoryQuery = Parameters<MarketDataCache['queryBars']>[0]
type HistoryResult = Awaited<ReturnType<MarketDataCache['queryBars']>>

interface LoadedPages {
  readonly pages: KLineData[][]
  readonly last: HistoryResult
}

/** 沿游标分页读取，直到满足 lower_tf 数量或 security 预热范围。 */
async function fetchPages(
  deps: Dependencies,
  demand: IndicatorBarsDemand,
  request: IndicatorBarsRequest,
  query: HistoryQuery,
  clock: ScriptTimeContext | undefined,
  budget: number,
): Promise<LoadedPages> {
  let cursor =
    request.mode === 'lower_tf'
      ? timeValue(clock!, 'close', demand.session.selection.period, demand.to)
      : undefined
  const pages: KLineData[][] = []
  let loaded = 0
  let warmup = 0
  for (;;) {
    const result = await deps.cache.queryBars({ ...query, beforeTimestamp: cursor })
    demand.abort.signal.throwIfAborted()
    if (deps.current() !== demand.session) throw new Error('Request 图表会话已切换')
    const page = [...result.series.data]
    pages.unshift(page)
    loaded += page.length
    warmup += page.filter((bar) => bar.timestamp < demand.from).length
    const covered =
      request.mode === 'lower_tf'
        ? loaded >= budget || (page[0]?.timestamp ?? Infinity) <= demand.from
        : warmup >= request.calcBarsCount
    if (
      covered ||
      !page.length ||
      (result.series.olderData === OLDER_DATA_STATUS.EXHAUSTED && page.length < query.limit)
    )
      return { pages, last: result }
    const next = page[0]!.timestamp
    if (cursor !== undefined && next >= cursor) throw new Error('Request 历史游标没有前进')
    cursor = next
  }
}

/** 将分页结果合并到共享 Buffer，并发布最终数据源能力。 */
function mergePages(
  deps: Dependencies,
  demand: IndicatorBarsDemand,
  period: KLinePeriod,
  pages: readonly KLineData[][],
  result: HistoryResult,
  baseline: ReadonlyMap<number, KLineData> | undefined,
): void {
  const selection = deps.resolveSelection(
    result.instrument,
    period,
    demand.session.selection.adjustment,
    demand.session.selection.barAggregation,
  )
  const buffer = deps.cache.repository.getOrCreateBars(selection, () => new DataBuffer())
  const concurrent =
    demand.buffer === buffer
      ? buffer.getRawData().filter((bar) => baseline?.get(bar.timestamp) !== bar)
      : []
  buffer.mergePage(pages.flat(), result.series.olderData, result.series.timezone)
  if (concurrent.length)
    buffer.mergePage(concurrent, result.series.olderData, result.series.timezone)
  const capabilities = deps.registry.get(result.sourceId)?.source.capabilities
  if (!capabilities) throw new Error(`Request 数据源没有能力声明：${result.sourceId}`)
  demand.target = { selection, instrument: result.instrument, capabilities }
  demand.buffer = buffer
  deps.bind(demand.owners, demand.target, buffer)
}

/** 执行一次需求的历史准备，并把结果写入 Repository 的共享 Buffer。 */
export async function loadIndicatorBars(
  deps: Dependencies,
  demand: IndicatorBarsDemand,
  request: IndicatorBarsRequest,
  period: KLinePeriod,
): Promise<void> {
  const { session, abort } = demand
  abort.signal.throwIfAborted()
  const sameSymbol = request.symbol === session.instrument.symbol
  if (!sameSymbol && request.source === undefined)
    throw new Error('跨品种 Request 必须显式指定 source')
  const sourceId = request.source ?? session.instrument.sourceId
  const instrument =
    sameSymbol && sourceId === session.instrument.sourceId ? session.instrument : undefined
  let baseline: Map<number, KLineData> | undefined
  if (instrument) {
    const selection = deps.resolveSelection(
      instrument,
      period,
      session.selection.adjustment,
      session.selection.barAggregation,
    )
    demand.buffer = deps.cache.repository.getOrCreateBars(selection, () => new DataBuffer())
    baseline = new Map(demand.buffer.getRawData().map((bar) => [bar.timestamp, bar]))
    demand.target = { selection, instrument, capabilities: session.capabilities }
    deps.bind(demand.owners, demand.target, demand.buffer)
  }
  const budget = Math.min(request.calcBarsCount, DEFAULT_INTRABAR_LIMIT)
  const query = {
    symbol: request.symbol,
    period,
    sourceId,
    instrument,
    adjustment: session.selection.adjustment,
    barAggregation: session.selection.barAggregation,
    limit:
      request.mode === 'lower_tf' ? Math.min(DEFAULT_REQUEST_BARS, budget) : request.calcBarsCount,
    signal: abort.signal,
  }
  const clock = marketClock(session, deps.sessions)
  if (request.mode === 'lower_tf' && !clock) throw new Error('低周期明细需要品种的市场时段配置')
  const loaded = await fetchPages(deps, demand, request, query, clock, budget)
  mergePages(deps, demand, period, loaded.pages, loaded.last, baseline)
}
