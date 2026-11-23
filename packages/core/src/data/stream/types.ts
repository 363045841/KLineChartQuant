/**
 * 实时行情流的领域契约。
 *
 * 一条连接承载一次批量订阅；连接本身是状态机，传输只是一次性对象。
 * 这里的类型同时是 wire 协议与前端内部契约的唯一事实来源。
 */

import type { BarAggregation, KLineAdjustment, KLinePeriod } from '../provider/types.js'

/** 流通道；报价与 K 线是两条独立订阅。 */
export type StreamChannel = 'bars' | 'quotes'

/** 连接阶段；`backing-off` 表示已断开、正在等待下一次重连。 */
export type StreamPhase = 'connecting' | 'online' | 'backing-off' | 'stopped'

/** 服务端声明的行情状态；未知取值视为协议错误。 */
export const STREAM_STATUS = {
  live: 'live',
  marketClosed: 'market-closed',
  noData: 'no-data',
  upstreamError: 'upstream-error',
} as const

export type StreamStatus = (typeof STREAM_STATUS)[keyof typeof STREAM_STATUS]

/** 稳定错误码；跨 Connector 共用同一份词表。 */
export const STREAM_ERROR_CODES = {
  badRequest: 'bad-request',
  unsupportedCapability: 'unsupported-capability',
  unknownInstrument: 'unknown-instrument',
  upstreamUnavailable: 'upstream-unavailable',
  protocol: 'protocol',
  internal: 'internal',
} as const

export type StreamErrorCode = (typeof STREAM_ERROR_CODES)[keyof typeof STREAM_ERROR_CODES]

/** 一根 K 线；时间戳为 UTC 毫秒。 */
export interface StreamBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
}

/** 报价；涨跌幅由消费端按昨收派生。 */
export interface StreamQuote {
  last: number
  prevClose: number
  timestamp: number
}

/** 连接级信封：所有帧都带单调序号与服务端时间。 */
interface FrameEnvelope {
  seq: number
  ts: number
}

/**
 * V1.1 流帧。
 *
 * 品种身份只出现在品种帧上；`hello`、`ping` 是连接级帧。
 */
export type StreamFrame =
  | (FrameEnvelope & {
      type: 'hello'
      instruments: ReadonlyArray<string>
      snapshotSize: number
      period?: KLinePeriod
      adjustment?: KLineAdjustment
      barAggregation?: BarAggregation
    })
  | (FrameEnvelope & {
      type: 'snapshot'
      instrumentId: string
      bars: ReadonlyArray<StreamBar>
    })
  | (FrameEnvelope & {
      type: 'bar'
      instrumentId: string
      state: 'forming' | 'closed'
      bar: StreamBar
    })
  | (FrameEnvelope & { type: 'quote'; instrumentId: string; quote: StreamQuote })
  | (FrameEnvelope & {
      type: 'status'
      instrumentId: string
      status: StreamStatus
      detail?: string
    })
  | (FrameEnvelope & { type: 'ping' })
  | (FrameEnvelope & {
      type: 'error'
      code: StreamErrorCode
      message: string
      retryable: boolean
      instrumentId?: string
    })

/** 一次连接承载的品种集合与序列参数。 */
export interface StreamRequest {
  source: string
  channel: StreamChannel
  instrumentIds: ReadonlyArray<string>
  period?: KLinePeriod
  adjustment?: KLineAdjustment
  barAggregation?: BarAggregation
}

/** 一条逻辑订阅的身份；连接键由注册表派生。 */
export interface StreamSubscriptionRequest {
  source: string
  channel: StreamChannel
  instrumentId: string
  period?: KLinePeriod
  adjustment?: KLineAdjustment
  barAggregation?: BarAggregation
}

/** 连接生命周期事件；订阅者据此做数据补偿，不轮询状态。 */
export type StreamEvent =
  | { kind: 'opened'; reconnected: boolean }
  | { kind: 'lost'; reason: string }
  | { kind: 'stopped'; reason: string }

/** 传输只会因为一次失败而结束；是否重连由连接自己决定。 */
export interface StreamClose {
  readonly retryable: boolean
  readonly message: string
}

/** 传输回调；传输不解析业务语义，只上报原始帧与关闭事实。 */
export interface StreamTransportHandlers {
  onOpen(): void
  onFrame(frame: StreamFrame): void
  onClose(close: StreamClose): void
}

/** 一次性传输：打开、关闭，不负责重连与存活判断。 */
export interface StreamTransport {
  open(): void
  close(): void
}

/** 传输工厂；内置 SSE 与宿主数据源共用这一形状。 */
export type StreamTransportFactory = (
  request: StreamRequest,
  handlers: StreamTransportHandlers,
) => StreamTransport

/** 订阅句柄；关闭后不再收到任何事件。 */
export interface StreamSubscription {
  readonly request: StreamSubscriptionRequest
  onFrame(callback: (frame: StreamFrame) => void): () => void
  onEvent(callback: (event: StreamEvent) => void): () => void
  close(): void
}

/** 全仓唯一的连接入口；按连接键复用物理连接。 */
export interface StreamHub {
  subscribe(request: StreamSubscriptionRequest): StreamSubscription
  /** 立即重试所有退避中的连接；页面唤醒、网络恢复时调用。 */
  resume(): void
  dispose(): void
}
