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

/** 统一连接状态码，传输层与存储层消费同一契约。 */
export const TRADE_STREAM_CODES = {
  connected: 'CONNECTED',
  disconnected: 'DISCONNECTED',
  gap: 'TRADE_GAP',
} as const

/** 成交加载/协议/订阅错误的单一文案来源；生产者与渲染器共用，避免多处各写一份。 */
export const TRADE_MESSAGES = Object.freeze({
  tickSizeInvalid: '品种缺少有效的最小价格单位（tickSize），无法计算足迹',
  protocolError: '成交流协议错误',
  disconnected: '成交流连接中断',
  unsupportedRaw: '当前品种不支持原始逐笔成交',
  capacityExceeded: '当前成交需求超过行情缓存预算，请缩小范围',
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

/** 计算输入只携带成交；完整覆盖独立记录，不能从批次首尾推断。 */
export interface TradeChunk {
  readonly items: readonly MarketTrade[]
}

export interface TradeSnapshot {
  readonly revision: number
  readonly status: TradeStatus
  readonly tickSize: string
  readonly batches: readonly TradeChunk[]
  /** 已验证的左闭右开范围；与收到的成交批次独立。 */
  readonly coverage: readonly TradeRange[]
  /** 数据已延伸到的时间；只用于判断新旧，不能代表范围完整。 */
  readonly latestTimestamp: number
  readonly message: string | null
}

/** 存储只发布数据事实；查询状态仅在交给指标时合成。 */
export type TradeFacts = Omit<TradeSnapshot, 'status' | 'message'>

/** 待提交更新用于公共缓存写入前检查预算，不能提前发布覆盖。 */
export interface TradeUpdate {
  readonly facts: TradeFacts
  commit(): void
}

export const EMPTY_TRADE_SNAPSHOT: TradeSnapshot = Object.freeze({
  revision: 0,
  status: TRADE_STATUS.idle,
  tickSize: '0',
  batches: [],
  coverage: [],
  latestTimestamp: 0,
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
  readonly snapshot: ReadonlySignal<TradeFacts>
  readonly disposed: boolean
  /** 当前实时段的历史验证边界，不包含消费者需求。 */
  readonly historyBoundary: number | null
  /** 准备历史写入，数据与覆盖在准入后同时提交。 */
  prepareHistory(batch: TradeBatch): TradeUpdate
  /** 准备实时写入，序列状态在准入后才推进。 */
  prepareFrame(frame: TradeFrame): TradeUpdate
  /** 回收指定范围外的成交和覆盖，返回是否发生变化。 */
  retain(range: TradeRange): boolean
  /** 清除数据和连续性证明，保留实例身份。 */
  clear(): void
  /** 销毁实例并阻止后续写入。 */
  dispose(): void
}
