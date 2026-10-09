/** 从活动行情就绪状态统一管理 K 线流、成交流及视口历史成交需求。 */

import {
  SERIES_SELECTION_KIND,
  seriesSelectionKey,
  type TradesSelection,
} from '@/data/buffer/impl/seriesRepository.js'
import { RealtimeBarsConnector } from '@/data/live/impl/barsLive.js'
import type { LiveBarsStream } from '@/data/live/types.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import {
  EMPTY_TRADE_SNAPSHOT,
  TRADE_MESSAGES,
  TRADE_STATUS,
  TRADE_STREAM_CODES,
  type TradeBuffer,
  type TradeDataSource,
  type TradeStream,
} from '@/data/trades/types.js'
import type { MarketRuntimeDependencies, ReadyMarketSession } from '../types.js'

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

/** 会话与品种是否同时声明支持原始实时成交流；能力位判断只此一处。 */
function supportsRawTradeStream(session: ReadyMarketSession): boolean {
  const { instrument } = session
  return Boolean(
    session.capabilities.trades?.live &&
      instrument.capabilities.trades?.raw &&
      instrument.capabilities.trades.live,
  )
}

/** 解析当前会话是否支持原始成交流；不支持时返回 null。 */
function resolveTradeTarget(
  session: ReadyMarketSession | null,
  needed: boolean,
): TradeTarget | null {
  if (!needed || !session) return null
  if (!supportsRawTradeStream(session)) return null
  const { instrument } = session
  const provider = marketDataProviderRegistry.get(instrument.sourceId)
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

/** 一个图表只有一个运行模块；视口变化只更新需求，连接身份由就绪快照决定。 */
export class MarketRuntime {
  private live: { stream: LiveBarsStream; connector: RealtimeBarsConnector } | null = null
  private session: ReadyMarketSession | null = null
  private trade: TradeBinding | null = null
  private demandTimer: ReturnType<typeof setTimeout> | null = null
  private readonly subscriptions: (() => void)[]
  private disposed = false

  constructor(private readonly deps: MarketRuntimeDependencies) {
    this.subscriptions = [
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
      const previous = this.live
      this.live = null
      previous?.connector.stop()
      previous?.stream.destroy()
      if (next?.capabilities.liveBars) {
        const provider = marketDataProviderRegistry.get(next.instrument.sourceId)
        if (provider?.liveBars) {
          const stream = provider.liveBars.createStream({
            symbol: next.instrument.symbol,
            period: next.selection.period,
            barAggregation: next.selection.barAggregation,
          })
          const connector = new RealtimeBarsConnector(
            {
              updateBars: (bars) => {
                if (
                  !this.disposed &&
                  this.live?.stream === stream &&
                  this.deps.session.peek() === next
                )
                  this.deps.writeBars(next, bars)
              },
            },
            stream,
          )
          this.live = { stream, connector }
          connector.start()
        }
      }
    }
    this.reconcileTrades()
  }

  /** 指标需求变化时协调成交订阅；同一就绪品种的重复协调复用连接及缓存。 */
  reconcileTrades(): void {
    if (this.disposed) return
    const target = resolveTradeTarget(this.deps.session.peek(), this.deps.needsTrades())
    if (!target) {
      this.unmountTrade()
      this.publishUnsupported()
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

  /** 成交不可用时发布空闲或品种不支持状态；两种情况都不建立连接。 */
  private publishUnsupported(): void {
    const session = this.deps.session.peek()
    const requiresTrades = this.deps.needsTrades() && session !== null
    this.deps.publishTrades({
      ...EMPTY_TRADE_SNAPSHOT,
      status: requiresTrades ? TRADE_STATUS.unsupported : TRADE_STATUS.idle,
      message: requiresTrades ? TRADE_MESSAGES.unsupportedRaw : null,
    })
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
    this.live?.connector.stop()
    this.live?.stream.destroy()
    this.live = null
    this.unmountTrade()
  }
}
