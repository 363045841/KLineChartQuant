/** 指标行情需求仓库：共享历史准备、持有使用权，并从公共Buffer读取最新快照。 */
import {
  type Bar,
  DEFAULT_INTRABAR_LIMIT,
  DEFAULT_REQUEST_BARS,
  type IndicatorBarsRequest,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import { DataBuffer } from '@/data/buffer/impl/dataBuffer.js'
import type { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import { seriesSelectionKey } from '@/data/buffer/impl/seriesRepository.js'
import type { KLineBuffer } from '@/data/buffer/types.js'
import type { MarketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { KLINE_PERIODS, OLDER_DATA_STATUS } from '@/data/provider/types.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { MarketRuntimeDependencies, ReadyMarketSession } from '../types.js'
import { assertSecurityPeriod, requestPeriod } from './requestPeriod.js'

interface Dependencies {
  readonly cache: MarketDataCache
  readonly registry: MarketDataProviderRegistry
  readonly sessions: MarketSessionRegistry
  current(): ReadyMarketSession | null
  readonly resolveSelection: MarketRuntimeDependencies['resolveBarsSelection']
  bind(owners: ReadonlySet<string>, target: ReadyMarketSession, buffer: KLineBuffer): void
}
interface Demand {
  readonly owners: Set<string>
  readonly session: ReadyMarketSession
  readonly abort: AbortController
  readonly from: number
  readonly to: number
  readonly ready: Promise<void>
  target?: ReadyMarketSession
  buffer?: KLineBuffer
}

/** 等待可以取消，需求本身只由使用者集合和会话生命周期释放。 */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export class IndicatorBarsRepository {
  private readonly demands = new Map<string, Demand>()
  constructor(private readonly deps: Dependencies) {}

  /** 全量使用者快照；同一需求的最后一位离开时才中止分页。 */
  retain(owners: ReadonlySet<string>): void {
    for (const [key, demand] of this.demands) {
      for (const id of demand.owners) if (!owners.has(id)) demand.owners.delete(id)
      if (demand.owners.size) continue
      demand.abort.abort()
      this.demands.delete(key)
    }
  }

  clear(): void {
    for (const demand of this.demands.values()) demand.abort.abort()
    this.demands.clear()
  }

  /** 明确的请求身份不包含主图实时版本；同一需求复用准备任务和实时Buffer。 */
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
    const clock = this.clock(session)
    const owners = new Set([owner])
    for (;;) {
      let demand = this.demands.get(key)
      if (!demand) {
        const abort = new AbortController()
        // 微任务开始准备，先登记身份，使并发调用始终看到同一任务。
        const created: Demand = {
          owners,
          session,
          abort,
          from,
          to,
          ready: Promise.resolve().then(() => this.prepare(created, request, period)),
        }
        demand = created
        this.demands.set(key, created)
        void created.ready.catch(() => {
          if (this.demands.get(key) === created) this.demands.delete(key)
        })
      }
      demand.owners.add(owner)
      if (demand.target && demand.buffer)
        this.deps.bind(demand.owners, demand.target, demand.buffer)
      await waitFor(demand.ready, signal)
      signal?.throwIfAborted()
      demand.abort.signal.throwIfAborted()
      if (this.deps.current() !== session) throw new Error('Request 图表会话已切换')
      if (this.demands.get(key) !== demand) continue
      const buffer = demand.buffer
      if (!buffer) return []
      const targetOpen = clock ? timeValue(clock, 'open', period, to) : to
      const needsHistory = from < demand.from
      const needsTail =
        to > demand.to && (buffer.getRawData().at(-1)?.timestamp ?? -Infinity) < targetOpen
      if (needsHistory || needsTail) {
        for (const id of demand.owners) owners.add(id)
        this.demands.delete(key)
        continue
      }
      if (demand.target) this.deps.bind(demand.owners, demand.target, buffer)
      const end = clock ? timeValue(clock, 'close', session.selection.period, to) : Infinity
      const available = buffer.getRawData().filter((bar) => bar.timestamp < end)
      const snapshot =
        request.mode === 'lower_tf'
          ? available.slice(-Math.min(request.calcBarsCount, DEFAULT_INTRABAR_LIMIT))
          : available
      return snapshot.map((bar) =>
        Object.freeze({
          time: bar.timestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume ?? 0,
        }),
      )
    }
  }

  /** 市场时间来自宿主同一注册表，历史终点与脚本分桶共用时间规则。 */
  private clock(session: ReadyMarketSession) {
    const id = session.instrument.sessionId
    return id === undefined
      ? undefined
      : { period: session.selection.period, session: this.deps.sessions.getRequired(id) }
  }

  /** 已知品种先订阅实时，再沿游标补历史；分页不持有任何计算Worker。 */
  private async prepare(
    demand: Demand,
    request: IndicatorBarsRequest,
    period: ReturnType<typeof requestPeriod>,
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
      const selection = this.deps.resolveSelection(
        instrument,
        period,
        session.selection.adjustment,
        session.selection.barAggregation,
      )
      demand.buffer = this.deps.cache.repository.getOrCreateBars(selection, () => new DataBuffer())
      baseline = new Map(demand.buffer.getRawData().map((bar) => [bar.timestamp, bar]))
      demand.target = { selection, instrument, capabilities: session.capabilities }
      this.deps.bind(demand.owners, demand.target, demand.buffer)
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
        request.mode === 'lower_tf'
          ? Math.min(DEFAULT_REQUEST_BARS, budget)
          : request.calcBarsCount,
      signal: abort.signal,
    }
    const clock = this.clock(session)
    if (request.mode === 'lower_tf' && !clock) throw new Error('低周期明细需要品种的市场时段配置')
    let cursor =
      request.mode === 'lower_tf'
        ? timeValue(clock, 'close', session.selection.period, demand.to)
        : undefined
    const pages: KLineData[][] = []
    let loaded = 0
    let warmup = 0
    for (;;) {
      const result = await this.deps.cache.queryBars({ ...query, beforeTimestamp: cursor })
      abort.signal.throwIfAborted()
      if (this.deps.current() !== session) throw new Error('Request 图表会话已切换')
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
      ) {
        const selection = this.deps.resolveSelection(
          result.instrument,
          period,
          query.adjustment,
          query.barAggregation,
        )
        const buffer = this.deps.cache.repository.getOrCreateBars(selection, () => new DataBuffer())
        const concurrent =
          demand.buffer === buffer
            ? buffer.getRawData().filter((bar) => baseline?.get(bar.timestamp) !== bar)
            : []
        buffer.mergeData(pages.flat(), result.series.olderData, result.series.timezone)
        if (concurrent.length)
          buffer.mergeData(concurrent, result.series.olderData, result.series.timezone)
        const capabilities = this.deps.registry.get(result.sourceId)?.source.capabilities
        if (!capabilities) throw new Error(`Request 数据源没有能力声明：${result.sourceId}`)
        demand.target = { selection, instrument: result.instrument, capabilities }
        demand.buffer = buffer
        this.deps.bind(demand.owners, demand.target, buffer)
        return
      }
      const next = page[0]!.timestamp
      if (cursor !== undefined && next >= cursor) throw new Error('Request 历史游标没有前进')
      cursor = next
    }
  }
}
