/** 逐笔成交领域契约；价格和数量保留十进制精度，时间区间统一为左闭右开。 */
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { InstrumentDescriptor } from '../provider/types.js'

export const TRADE_STATUS = {
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  gap: 'gap',
  error: 'error',
  unsupported: 'unsupported',
} as const
export type TradeStatus = (typeof TRADE_STATUS)[keyof typeof TRADE_STATUS]

/** 成交加载/协议/订阅错误的单一文案来源；生产者与渲染器共用，避免多处各写一份。 */
export const TRADE_MESSAGES = Object.freeze({
  tickSizeInvalid: '品种缺少有效的最小价格单位（tickSize），无法计算足迹',
  capacityExceeded: '可视范围的逐笔成交超过缓存预算，请缩小范围',
  pendingOverflow: '历史加载期间的成交缓冲已达上限',
  protocolError: '成交流协议错误',
  disconnected: '成交流连接中断',
  unsupportedRaw: '当前品种不支持原始逐笔成交',
})

/** 状态兜底文案：仅当快照未携带具体 message 时用于展示。 */
export const TRADE_STATUS_LABEL: Readonly<Record<TradeStatus, string>> = Object.freeze({
  idle: '',
  loading: '足迹成交加载中',
  ready: '',
  gap: '足迹成交存在缺口',
  error: '足迹成交加载失败',
  unsupported: TRADE_MESSAGES.unsupportedRaw,
})

export interface MarketTrade {
  readonly tradeId: string
  readonly timestamp: number
  readonly price: string
  readonly size: string
  readonly side: 'buy' | 'sell'
}

export interface TradeRange {
  readonly from: number
  readonly to: number
}
export interface TradeBatch {
  readonly items: readonly MarketTrade[]
  readonly range: TradeRange
  readonly complete: boolean
}

export interface TradeSnapshot {
  readonly revision: number
  readonly status: TradeStatus
  readonly tickSize: string
  readonly batches: readonly TradeBatch[]
  readonly message: string | null
}

export const EMPTY_TRADE_SNAPSHOT: TradeSnapshot = Object.freeze({
  revision: 0,
  status: TRADE_STATUS.idle,
  tickSize: '0',
  batches: [],
  message: null,
})

export type TradeFrame =
  | { readonly type: 'trades'; readonly trades: readonly MarketTrade[] }
  | {
      readonly type: 'status'
      readonly code: string
      readonly message?: string
      readonly complete?: boolean
    }

export interface TradeStream {
  subscribe(listener: (frame: TradeFrame) => void): () => void
  close(): void
}

/** 历史与实时由同一 Provider 能力提供，消费者不解析交易所私有引用。 */
export interface TradeDataSource {
  fetch(query: {
    readonly instrument: InstrumentDescriptor
    readonly range: TradeRange
    readonly signal: AbortSignal
  }): Promise<TradeBatch>
  connect(instrument: InstrumentDescriptor): TradeStream
}

export interface TradeBuffer {
  readonly snapshot: ReadonlySignal<TradeSnapshot>
  ensureRange(range: TradeRange): Promise<void>
  retainFrom(timestamp: number): void
  dispose(): void
}
