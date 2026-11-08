/**
 * 实时订阅的领域契约：一条连接批量承载多个品种，池负责把逻辑订阅聚合到连接上。
 *
 * 通道（K 线 / 报价）是订阅维度而不是连接维度：K 线需要序列参数，报价只要品种。
 */

import type { ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { MarketProviderHealth } from '../management/types.js'
import type { MarketDataProviderRegistry } from '../provider/impl/registry.js'
import type { BarAggregation, KLineAdjustment, KLinePeriod } from '../provider/types.js'

/** 实时通道；同一品种的 K 线与报价是两条独立订阅。 */
export type RealtimeChannel = 'bars' | 'quotes'

/** 实时 K 线载荷（UTC 毫秒时间戳）。 */
export interface LiveBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
}

/** 实时报价；涨跌幅由消费端按昨收派生，不在链路上重复传输。 */
export interface LiveQuote {
  last: number
  /** 昨收；涨跌色的唯一基准。 */
  prevClose: number
  timestamp: number
}

/** 连接级实时帧；instrumentId 是唯一身份，通道由订阅决定。 */
export type LiveFrame =
  | {
      channel: 'bars'
      type: 'update' | 'historical' | 'closed' | 'forming'
      instrumentId: string
      bar: LiveBar
    }
  | {
      channel: 'bars'
      type: 'snapshot'
      instrumentId: string
      bars: ReadonlyArray<LiveBar>
    }
  | { channel: 'bars'; type: 'invalidate'; instrumentId: string }
  | { channel: 'bars'; type: 'status'; instrumentId: string; status: string; detail?: string }
  | { channel: 'quotes'; type: 'quote'; instrumentId: string; quote: LiveQuote }

/** 连接状态；整条连接上的全部订阅共享同一份状态。 */
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * 一条逻辑订阅的身份。
 *
 * 连接身份由池派生：报价按来源聚合，K 线按来源 + 周期 + 聚合 + 复权聚合。
 */
export interface RealtimeSubscriptionRequest {
  sourceId: string
  channel: RealtimeChannel
  /** 数据源范围内的稳定品种 ID；链路不再用 symbol 猜测身份。 */
  instrumentId: string
  /** bars 通道必填。 */
  period?: KLinePeriod
  barAggregation?: BarAggregation
  adjustment?: KLineAdjustment
}

/** 订阅者持有的句柄；close 之后不再收到任何事件。 */
export interface RealtimeSubscription {
  readonly request: RealtimeSubscriptionRequest
  onFrame(callback: (frame: LiveFrame) => void): () => void
  onStatus(callback: (status: RealtimeStatus) => void): () => void
  onError(callback: (error: Error) => void): () => void
  close(): void
}

/** 一次连接承载的品种集合与序列参数。 */
export interface RealtimeConnectionRequest {
  sourceId: string
  channel: RealtimeChannel
  instrumentIds: ReadonlyArray<string>
  period?: KLinePeriod
  barAggregation?: BarAggregation
  adjustment?: KLineAdjustment
}

/** 传输实现：默认 SSE 与宿主自带传输共用这一形状。 */
export interface RealtimeConnection {
  onFrame(callback: (frame: LiveFrame) => void): () => void
  onStatus(callback: (status: RealtimeStatus) => void): () => void
  onError(callback: (error: Error) => void): () => void
  connect(): void
  disconnect(): void
  destroy(): void
}

/** 一次连接的工厂；传输在宿主装配时确定，不由消费者猜测。 */
export type RealtimeConnectionFactory = (request: RealtimeConnectionRequest) => RealtimeConnection

/** 实时订阅池：全仓唯一的订阅入口。 */
export interface RealtimeSubscriptionPool {
  subscribe(request: RealtimeSubscriptionRequest): RealtimeSubscription
  dispose(): void
}

/** 池直接消费现有配置与健康快照，不复制一套来源状态。 */
export interface RealtimeSubscriptionPoolOptions {
  readonly registry: MarketDataProviderRegistry
  readonly health: ReadonlySignal<Readonly<Record<string, MarketProviderHealth>>>
  readonly createConnection: RealtimeConnectionFactory
  /** 合并同一轮输入变化；测试可注入手动队列。 */
  defer?(run: () => void): void
}
