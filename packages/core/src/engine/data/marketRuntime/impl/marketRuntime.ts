/** 从活动行情就绪状态统一管理 K 线流、成交流及视口历史成交需求。 */

import type {
  IndicatorBarsRequest,
  IndicatorMarketContext,
} from '@363045841yyt/klinechart-plot-contracts'
import type { SymbolSpec } from '@/controllers/types.js'
import { DataBuffer } from '@/data/buffer/impl/dataBuffer.js'
import {
  type BarsSelection,
  SERIES_SELECTION_KIND,
  seriesSelectionKey,
  type TradesSelection,
} from '@/data/buffer/impl/seriesRepository.js'
import type { KLineBuffer } from '@/data/buffer/types.js'
import { RealtimeBarsConnector } from '@/data/live/impl/barsLive.js'
import type { LiveBarsStream } from '@/data/live/types.js'
import {
  type MarketDataProviderRegistry,
  marketDataProviderRegistry,
} from '@/data/provider/impl/registry.js'
import { OLDER_DATA_STATUS } from '@/data/provider/types.js'
import {
  EMPTY_TRADE_SNAPSHOT,
  TRADE_STREAM_CODES,
  type TradeBuffer,
  type TradeDataSource,
  type TradeStream,
} from '@/data/trades/types.js'
import type { IndicatorMarketData } from '@/engine/indicators/instances/execution/marketDataTypes.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  type MarketRuntimeDependencies,
  type ReadyMarketSession,
  supportsRawTradeStream,
} from '../types.js'
import { assertSecurityPeriod, requestPeriod } from './requestPeriod.js'

/** 成交流订阅的身份与传输目标；由就绪会话和指标需求解析得到。 */
interface TradeTarget {
  readonly selection: TradesSelection
  readonly instrument: ReadyMarketSession['instrument']
  readonly source: TradeDataSource
}

/** 已建立的成交流绑定；订阅、请求与缓冲引用同生共死。 */
interface TradeBinding {
  readonly selection: TradesSelection
  readonly instrument: ReadyMarketSession['instrument']
  readonly buffer: TradeBuffer
  readonly stream: TradeStream
  readonly abort: AbortController
  readonly unsubscribe: () => void
}

/** 解析当前会话是否支持原始成交流；不支持时返回 null。 */
function resolveTradeTarget(
  session: ReadyMarketSession | null,
  needed: boolean,
  registry: MarketDataProviderRegistry,
): TradeTarget | null {
  if (!needed || !session) return null
  if (!supportsRawTradeStream(session)) return null
  const { instrument } = session
  const provider = registry.get(instrument.sourceId)
  if (!provider?.trades) return null
  return {
    selection: {
      kind: SERIES_SELECTION_KIND.trades,
      instrumentKey: session.selection.instrumentKey,
      sourceId: instrument.sourceId,
    },
    instrument,
    source: provider.trades,
  }
}

/** 当前绑定是否仍匹配目标身份；身份或 tickSize 变化时必须重建订阅。 */
function needsRebind(current: TradeBinding | null, target: TradeTarget): boolean {
  return (
    !current ||
    current.buffer.disposed ||
    seriesSelectionKey(current.selection) !== seriesSelectionKey(target.selection) ||
    current.instrument.tickSize !== target.instrument.tickSize
  )
}

/** 租约来源：计划快照可以回收自己声明的租约，临时计算只由自身生命周期释放。 */
type OwnerSource = 'plan' | 'temporary'

/** 一个图表只有一个运行模块；视口变化只更新需求，连接身份由就绪快照决定。 */
export class MarketRuntime implements IndicatorMarketData {
  private readonly registry: MarketDataProviderRegistry
  private readonly live = new Map<
    string,
    { stream: LiveBarsStream; connector: RealtimeBarsConnector; abort: AbortController }
  >()
  private readonly barDemands = new Map<
    string,
    { session: ReadyMarketSession; buffer: KLineBuffer; comparison: boolean; owners: Set<string> }
  >()
  private readonly requestAborts = new Map<string, AbortController>()
  private requestRevision = 0
  /** 行情租约的唯一事实：key → 来源。请求与需求条目只是它的投影。 */
  private readonly owners = new Map<string, OwnerSource>()
  private temporarySequence = 0

  /** 临时计算持有一份租约，结束后只释放自己的请求与需求。 */
  async withContext<T>(
    bars: readonly KLineData[],
    compute: (market: IndicatorMarketContext) => Promise<T>,
  ): Promise<T> {
    const owner = `temporary_${++this.temporarySequence}`
    this.owners.set(owner, 'temporary')
    try {
      return await compute(this.context(owner, bars))
    } finally {
      this.owners.delete(owner)
      this.sweep()
    }
  }

  /** 行情依赖版本参与现有指标缓存身份。 */
  get revision(): number {
    return this.requestRevision
  }

  /** 使用已解析的品种身份查找现有需求，先请求后添加比较也复用同一个叶子。 */
  findBarsSelection(
    spec: SymbolSpec,
    period: BarsSelection['period'],
    adjustment: BarsSelection['adjustment'],
    aggregation: BarsSelection['barAggregation'],
  ): BarsSelection | undefined {
    const source = spec.source === undefined ? spec.instrument?.sourceId : spec.source
    for (const demand of this.barDemands.values()) {
      const { selection, instrument } = demand.session
      if (
        selection.sourceId !== source ||
        selection.period !== period ||
        selection.adjustment !== adjustment ||
        selection.barAggregation !== aggregation
      )
        continue
      const matches =
        spec.instrument === undefined
          ? spec.symbol === instrument.symbol &&
            (spec.exchange === undefined || spec.exchange === instrument.exchange)
          : spec.instrument.id === instrument.id
      if (matches) return selection
    }
    return undefined
  }

  /** 比较品种只登记行情使用权，连接与 Request 使用同一份序列身份。 */
  retainComparison(session: ReadyMarketSession, buffer: KLineBuffer): void {
    const demand = this.demand(session, buffer)
    demand.comparison = true
    this.reconcileBarStreams()
  }

  /** 释放比较使用权后，仍被主图或脚本使用的 Buffer 不允许被删除。 */
  releaseComparison(selection: BarsSelection): boolean {
    const key = seriesSelectionKey(selection)
    const demand = this.barDemands.get(key)
    if (demand !== undefined) demand.comparison = false
    this.releaseUnusedBars()
    this.reconcileBarStreams()
    const primary = this.deps.session.peek()
    return (
      !this.barDemands.has(key) &&
      (primary === null || seriesSelectionKey(primary.selection) !== key)
    )
  }

  /** 给计算任务提供只读取数端口，完整 Buffer 永不进入脚本。 */
  context(owner: string, bars: readonly KLineData[]): IndicatorMarketContext {
    const session = this.deps.session.peek()
    const symbol = session === null ? '' : session.instrument.symbol
    return Object.freeze({
      symbol,
      loadBars: (request: IndicatorBarsRequest) =>
        this.loadRequestBars(owner, bars, request, session),
    })
  }

  /** 执行计划的全量快照：只增删计划自己拥有的租约，临时计算不受影响。 */
  retain(planOwners: ReadonlySet<string>): void {
    for (const [owner, source] of this.owners)
      if (source === 'plan' && !planOwners.has(owner)) this.owners.delete(owner)
    for (const owner of planOwners) this.owners.set(owner, 'plan')
    this.sweep()
  }

  /** 把请求与需求投影对齐到租约集合，再回收无引用的 Buffer 与连接。 */
  private sweep(): void {
    for (const [owner, abort] of this.requestAborts) {
      if (this.owners.has(owner)) continue
      abort.abort()
      this.requestAborts.delete(owner)
    }
    for (const demand of this.barDemands.values())
      for (const owner of demand.owners) if (!this.owners.has(owner)) demand.owners.delete(owner)
    this.releaseUnusedBars()
    this.reconcileBarStreams()
  }

  /** 比较与脚本登记到同一个需求条目，保留 Repository 的唯一 Buffer。 */
  private demand(session: ReadyMarketSession, buffer: KLineBuffer) {
    const key = seriesSelectionKey(session.selection)
    let demand = this.barDemands.get(key)
    if (demand === undefined) {
      demand = { session, buffer, comparison: false, owners: new Set<string>() }
      this.barDemands.set(key, demand)
    } else {
      demand.session = session
      demand.buffer = buffer
    }
    return demand
  }

  /** 最后使用者退出时释放叶子，主图持有的叶子始终保留。 */
  private releaseUnusedBars(): void {
    const primary = this.deps.session.peek()
    for (const [key, demand] of this.barDemands) {
      if (demand.comparison || demand.owners.size > 0) continue
      this.barDemands.delete(key)
      if (primary === null || seriesSelectionKey(primary.selection) !== key)
        this.deps.cache.repository.delete(demand.session.selection)
    }
  }

  /** 沿游标加载覆盖主图历史的实际 K 线，再向前补足目标周期预热根数。 */
  private async loadRequestBars(
    owner: string,
    bars: readonly KLineData[],
    request: IndicatorBarsRequest,
    session: ReadyMarketSession | null,
  ) {
    if (this.disposed || session === null || this.deps.session.peek() !== session)
      throw new Error('Request 没有有效的图表行情会话')
    if (bars.length === 0) return []
    let abort = this.requestAborts.get(owner)
    if (abort === undefined) {
      abort = new AbortController()
      this.requestAborts.set(owner, abort)
    }
    const signal = abort.signal
    const period = requestPeriod(request.timeframe)
    assertSecurityPeriod(period, session.selection.period)
    const sameSymbol = request.symbol === session.instrument.symbol
    // 同品种继承图表已解析来源；跨品种没有确定来源，必须由调用方显式指定。
    if (!sameSymbol && request.source === undefined)
      throw new Error('跨品种 Request 必须显式指定 source')
    const sourceId = request.source ?? session.instrument.sourceId
    const sameInstrument = sameSymbol && sourceId === session.instrument.sourceId
    const instrument = sameInstrument ? session.instrument : undefined
    const query = {
      symbol: request.symbol,
      period,
      sourceId,
      instrument,
      adjustment: session.selection.adjustment,
      barAggregation: session.selection.barAggregation,
      limit: request.calcBarsCount,
      signal,
    }
    const pages: KLineData[][] = []
    let beforeTimestamp: number | undefined
    const earliest = bars[0]!.timestamp
    let warmup = 0
    let result = await this.deps.cache.queryBars(query)
    while (true) {
      signal.throwIfAborted()
      if (this.disposed || this.deps.session.peek() !== session)
        throw new Error('Request 图表会话已切换')
      const page = [...result.series.data]
      pages.unshift(page)
      warmup += page.filter((bar) => bar.timestamp < earliest).length
      if (
        warmup >= request.calcBarsCount ||
        (result.series.olderData === OLDER_DATA_STATUS.EXHAUSTED && page.length < query.limit) ||
        page.length === 0
      )
        break
      const cursor = page[0]!.timestamp
      if (beforeTimestamp !== undefined && cursor >= beforeTimestamp)
        throw new Error('Request 历史游标没有前进')
      beforeTimestamp = cursor
      result = await this.deps.cache.queryBars({ ...query, beforeTimestamp })
    }
    const selection = this.deps.resolveBarsSelection(
      result.instrument,
      period,
      query.adjustment,
      query.barAggregation,
    )
    const buffer = this.deps.cache.repository.getOrCreateBars(selection, () => new DataBuffer())
    buffer.mergeData(pages.flat(), result.series.olderData, result.series.timezone)
    const provider = this.registry.get(result.sourceId)
    if (provider === undefined) throw new Error(`Request 数据源不可用：${result.sourceId}`)
    const capabilities = provider.source.capabilities
    if (capabilities === undefined)
      throw new Error(`Request 数据源没有能力声明：${result.sourceId}`)
    this.demand({ selection, instrument: result.instrument, capabilities }, buffer).owners.add(
      owner,
    )
    this.reconcileBarStreams()
    return buffer.getRawData().map((bar) =>
      Object.freeze({
        time: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume === undefined ? 0 : bar.volume,
      }),
    )
  }

  /** 主图和 Request 共用同一张连接表，完整序列身份相同就复用连接。 */
  private reconcileBarStreams(): void {
    if (this.disposed) return
    const targets = new Map([...this.barDemands].map(([key, target]) => [key, target.session]))
    const primary = this.deps.session.peek()
    if (primary !== null) targets.set(seriesSelectionKey(primary.selection), primary)
    for (const [key, binding] of this.live) {
      if (targets.has(key)) continue
      this.live.delete(key)
      binding.abort.abort()
      binding.connector.stop()
      binding.stream.destroy()
    }
    for (const [key, target] of targets) {
      // 源声明是前提，品种可显式关闭（Connector 只对部分市场提供实时流）。
      if (this.live.has(key) || target.capabilities.liveBars !== true) continue
      if (target.instrument.capabilities.liveBars === false) continue
      // 能力位已在 probe 入库时与实现对齐；这里只做绑定，失败不得抛穿状态通知链。
      const liveBars = this.registry.get(target.instrument.sourceId)?.liveBars
      if (liveBars === undefined) continue
      const stream = liveBars.createStream({
        symbol: target.instrument.symbol,
        period: target.selection.period,
        barAggregation: target.selection.barAggregation,
        // 与 /bars 使用同一份已解析身份，避免服务端按裸 symbol 猜测或静默降级复权。
        instrumentId: target.instrument.id,
        exchange: target.instrument.exchange,
        adjustment: target.selection.adjustment,
      })
      const abort = new AbortController()
      const buffer = this.deps.cache.repository.getBars(target.selection)!
      const current = () => !this.disposed && this.live.get(key)?.stream === stream && !abort.signal.aborted
      let refreshing = false
      let invalidated = false
      const queued: { bar: KLineData; historical: boolean }[] = []
      /** 快照及增量变更沿同一 Buffer 和 Request 失效通道提交。 */
      const notify = () => {
        if ((this.barDemands.get(key)?.owners.size ?? 0) > 0) {
          this.requestRevision++
          this.deps.invalidateRequests?.()
        }
      }
      /** 失效重查串行执行；期间收到的增量按到达顺序重放，旧查询不能覆盖它们。 */
      const refresh = async () => {
        if (refreshing) return
        refreshing = true
        try {
          do {
            invalidated = false
            try {
              await this.deps.reloadBars(target, buffer, abort.signal)
            } finally {
              // 重查失败仍需提交已收到的实时事实；取消后整批丢弃，不能污染新会话。
              if (current()) {
                for (const event of queued.splice(0)) {
                  if (event.historical) buffer.correctBar(event.bar)
                  else buffer.applyRealtimeBars([event.bar])
                  this.deps.cache.acceptBars(target.selection, target.instrument, [event.bar])
                }
                notify()
              }
            }
          } while (invalidated && current())
        } catch (error) {
          if (current()) buffer.setError(error instanceof Error ? error.message : String(error))
        } finally {
          refreshing = false
        }
      }
      const connector = new RealtimeBarsConnector({
        updateBars: (bars, strictTail) => {
          if (!current()) return
          let latest = buffer.getRawData().at(-1)?.timestamp ?? -Infinity
          for (const event of queued) if (!event.historical) latest = Math.max(latest, event.bar.timestamp)
          for (const bar of bars) {
            if (strictTail && bar.timestamp < latest) throw new RangeError('Older bars require update(bar, { historical: true })')
            latest = Math.max(latest, bar.timestamp)
          }
          if (refreshing) { queued.push(...bars.map((bar) => ({ bar, historical: false }))); return }
          buffer.applyRealtimeBars(bars)
          this.deps.cache.acceptBars(target.selection, target.instrument, bars)
          notify()
        },
        correctBar: (bar) => {
          if (!current()) return
          if (buffer.getLogicalIndexAtTimestamp(bar.timestamp) === null) throw new RangeError('Historical correction must target an existing bar')
          if (refreshing) { queued.push({ bar, historical: true }); return }
          buffer.correctBar(bar)
          this.deps.cache.acceptBars(target.selection, target.instrument, [bar])
          notify()
        },
        invalidate: () => { if (current()) { invalidated = true; void refresh() } },
        setError: (message) => { if (current()) buffer.setError(message) },
      }, stream)
      this.live.set(key, { stream, connector, abort })
      connector.start()
    }
  }
  private session: ReadyMarketSession | null = null
  private trade: TradeBinding | null = null
  private demandTimer: ReturnType<typeof setTimeout> | null = null
  private readonly subscriptions: (() => void)[]
  private disposed = false

  constructor(private readonly deps: MarketRuntimeDependencies) {
    this.registry = deps.registry ?? marketDataProviderRegistry
    let previousRegistry = this.registry.state.peek()
    this.subscriptions = [
      this.registry.state.subscribe(() => {
        const nextRegistry = this.registry.state.peek()
        const id = this.session?.instrument.sourceId
        const source = id ? previousRegistry.providers.get(id)?.source : undefined
        const connectionId = source?.connectionId ?? id
        const changed =
          (connectionId &&
            previousRegistry.connections.get(connectionId) !==
              nextRegistry.connections.get(connectionId)) ||
          (id && previousRegistry.providers.get(id) !== nextRegistry.providers.get(id))
        previousRegistry = nextRegistry
        if (changed) {
          this.session = null
          this.unmountTrade()
          this.reconcileSession()
        }
      }),
      deps.session.subscribe(() => this.reconcileSession()),
      deps.visibleRange.subscribe(() => this.updateTradeDemand()),
      deps.data.subscribe(() => this.updateTradeDemand()),
    ]
    // 订阅不回放；读取当前快照，避免模块后挂载错过就绪状态。
    if (deps.session.peek()) this.reconcileSession()
  }

  /** 就绪状态变化时关闭旧 K 线流，并将每个实时回调绑定到它创建时的会话。 */
  private reconcileSession(): void {
    if (this.disposed) return
    const next = this.deps.session.peek()
    if (next !== this.session) {
      this.session = next
      for (const abort of this.requestAborts.values()) abort.abort()
      this.requestAborts.clear()
      for (const demand of this.barDemands.values()) demand.owners.clear()
      this.releaseUnusedBars()
      this.requestRevision++
      this.reconcileBarStreams()
    }
    this.reconcileTrades()
  }

  /** 主序列显示模式需求变化时协调成交订阅；同一就绪品种复用连接及缓存。 */
  reconcileTrades(): void {
    if (this.disposed) return
    const target = resolveTradeTarget(
      this.deps.session.peek(),
      this.deps.needsTrades(),
      this.registry,
    )
    if (!target) {
      this.unmountTrade()
      this.publishIdle()
      return
    }
    if (this.trade && !needsRebind(this.trade, target)) {
      this.updateTradeDemand()
      return
    }
    this.unmountTrade()
    this.mountTrade(target)
    this.updateTradeDemand()
  }

  /** 历史需求只由当前视口和就绪行情计算；拖动不会执行连接协调。 */
  private updateTradeDemand(): void {
    if (this.disposed || !this.trade || !this.deps.session.peek()) return
    if (this.demandTimer) return
    const trade = this.trade
    this.demandTimer = setTimeout(() => {
      this.demandTimer = null
      if (this.disposed || this.trade !== trade) return
      const range = this.deps.visibleRange.peek()
      const data = this.deps.data.peek()
      const first = data[Math.max(0, range.start)]?.timestamp
      const end = Math.min(range.end, data.length)
      const to = Math.min(data[end]?.timestamp ?? Date.now(), Date.now())
      if (first === undefined || end <= range.start || to <= first) return
      // 查询错误已由缓存写入成交快照；运行模块不另存失败名单。
      void this.deps.cache
        .queryTrades({
          selection: trade.selection,
          instrument: trade.instrument,
          range: { from: first, to },
          signal: trade.abort.signal,
        })
        .catch(() => {})
    }, 200)
  }

  /** 建立成交流订阅；tickSize 无效时仓库无法计算足迹，只发布错误而不连接。 */
  private mountTrade(target: TradeTarget): void {
    const buffer = this.deps.cache.getTradeBuffer(target.selection, target.instrument)
    if (!(Number(buffer.snapshot.peek().tickSize) > 0)) {
      this.deps.publishTrades(this.deps.cache.getTradeSnapshot(target.selection, buffer))
      return
    }
    const stream = target.source.connect(target.instrument)
    const publish = () => {
      if (this.trade?.buffer === buffer)
        this.deps.publishTrades(this.deps.cache.getTradeSnapshot(target.selection, buffer))
    }
    const unsubscribeSnapshot = buffer.snapshot.subscribe(publish)
    const unsubscribeQuery = this.deps.cache.queryRevision.subscribe(publish)
    const unsubscribeStream = stream.subscribe((frame) => {
      if (this.trade?.stream !== stream) return
      this.deps.cache.acceptTradeFrame(target.selection, target.instrument, frame)
      if (frame.type === 'trades' || frame.code === TRADE_STREAM_CODES.connected)
        this.updateTradeDemand()
    })
    this.trade = {
      selection: target.selection,
      instrument: target.instrument,
      buffer,
      stream,
      abort: new AbortController(),
      unsubscribe: () => {
        unsubscribeSnapshot()
        unsubscribeQuery()
        unsubscribeStream()
      },
    }
    publish()
  }

  /** 关闭订阅与查询并撤销连续性证明；缓冲实例仍由统一仓库持有。 */
  private unmountTrade(): void {
    this.clearTradeDemand()
    const trade = this.trade
    this.trade = null
    if (!trade) return
    trade.abort.abort()
    trade.unsubscribe()
    trade.stream.close()
    trade.buffer
      .prepareFrame({
        type: 'status',
        code: TRADE_STREAM_CODES.disconnected,
        complete: false,
      })
      .commit()
  }

  /** 无成交需求或品种不支持时发布空闲快照：不保留旧成交，也不建立连接。 */
  private publishIdle(): void {
    this.deps.publishTrades(EMPTY_TRADE_SNAPSHOT)
  }

  /** 取消旧视口尚未发出的历史需求。 */
  private clearTradeDemand(): void {
    if (this.demandTimer) clearTimeout(this.demandTimer)
    this.demandTimer = null
  }

  /** 先关闭写入资格，再释放监听、连接与历史请求。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.clearTradeDemand()
    for (const abort of this.requestAborts.values()) abort.abort()
    this.requestAborts.clear()
    this.barDemands.clear()
    for (const binding of this.live.values()) {
      binding.abort.abort()
      binding.connector.stop()
      binding.stream.destroy()
    }
    this.live.clear()
    this.unmountTrade()
  }
}
