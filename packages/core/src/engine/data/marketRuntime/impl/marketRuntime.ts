/** 从活动行情就绪状态统一管理 K 线流、成交流及视口历史成交需求。 */
import { RealtimeBarsConnector } from '@/data/live/impl/barsLive.js'
import type { LiveBarsStream } from '@/data/live/types.js'
import { marketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import { createTradeBuffer } from '@/data/trades/impl/tradeBuffer.js'
import {
  EMPTY_TRADE_SNAPSHOT,
  TRADE_MESSAGES,
  TRADE_STATUS,
  type TradeBuffer,
} from '@/data/trades/types.js'
import type { MarketRuntimeDependencies, ReadyMarketSession } from '../types.js'

/** 一个图表只有一个运行模块；视口变化只更新需求，连接身份由就绪快照决定。 */
export class MarketRuntime {
  private live: { stream: LiveBarsStream; connector: RealtimeBarsConnector } | null = null
  private session: ReadyMarketSession | null = null
  private trade: TradeBuffer | null = null
  private tradeKey = ''
  private unsubscribeTrade: (() => void) | null = null
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
    const session = this.deps.session.peek()
    const needed = this.deps.needsTrades()
    const provider = session
      ? marketDataProviderRegistry.get(session.instrument.sourceId)
      : undefined
    const supported =
      needed &&
      session?.capabilities.trades?.live &&
      session.instrument.capabilities.trades?.raw &&
      session.instrument.capabilities.trades.live &&
      provider?.trades
    const key =
      supported && session
        ? JSON.stringify([
            session.instrument.sourceId,
            session.instrument.id,
            session.instrument.tickSize,
          ])
        : ''
    if (key !== this.tradeKey) {
      this.clearTradeDemand()
      this.unsubscribeTrade?.()
      this.unsubscribeTrade = null
      this.trade?.dispose()
      this.trade = null
      this.tradeKey = key
      if (supported && session && provider?.trades) {
        const trade = createTradeBuffer(provider.trades, session.instrument)
        this.trade = trade
        this.deps.publishTrades(trade.snapshot.peek())
        this.unsubscribeTrade = trade.snapshot.subscribe(() => {
          if (this.trade === trade) this.deps.publishTrades(trade.snapshot.peek())
        })
      }
    }
    if (!supported) {
      this.deps.publishTrades({
        ...EMPTY_TRADE_SNAPSHOT,
        status: needed && session ? TRADE_STATUS.unsupported : TRADE_STATUS.idle,
        message: needed && session ? TRADE_MESSAGES.unsupportedRaw : null,
      })
    }
    this.updateTradeDemand()
  }

  /** 历史需求只由当前视口和就绪行情计算；拖动不会执行连接协调。 */
  private updateTradeDemand(): void {
    this.clearTradeDemand()
    if (this.disposed || !this.trade || !this.deps.session.peek()) return
    const range = this.deps.visibleRange.peek()
    const data = this.deps.data.peek()
    const first = data[Math.max(0, range.start)]?.timestamp
    const end = Math.min(range.end, data.length)
    const to = Math.min(data[end]?.timestamp ?? Date.now(), Date.now())
    if (first === undefined || end <= range.start || to <= first) return
    const trade = this.trade
    this.demandTimer = setTimeout(() => {
      this.demandTimer = null
      if (!this.disposed && this.trade === trade) void trade.ensureRange({ from: first, to })
    }, 200)
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
    this.unsubscribeTrade?.()
    this.trade?.dispose()
    this.trade = null
  }
}
