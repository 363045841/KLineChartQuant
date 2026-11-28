/**
 * 实时行情流的公共契约。
 *
 * 一条连接承载一个订阅需求，连接生命周期由状态机管理；传输只负责打开、上报原始
 * 帧和关闭。协议解析与重连策略是契约的唯一实现来源，宿主不感知帧语义。
 */

import type { BarAggregation, KLineAdjustment, KLinePeriod } from '../provider/types.js'

/** 通道：K 线通道与报价通道各自独立。 */
export type StreamChannel = 'bars' | 'quotes'

/** 连接阶段；`backing-off` 表示已断开并等待下一次重试。 */
export type StreamPhase = 'connecting' | 'online' | 'backing-off' | 'stopped'

/** 行情流声明的状态；未知取值视为协议错误。 */
export const STREAM_STATUS = {
  live: 'live',
  marketClosed: 'market-closed',
  noData: 'no-data',
  upstreamError: 'upstream-error',
} as const

export type StreamStatus = (typeof STREAM_STATUS)[keyof typeof STREAM_STATUS]

/** 稳定错误码；与 Connector 侧同一份字典。 */
export const STREAM_ERROR_CODES = {
  badRequest: 'bad-request',
  unsupportedCapability: 'unsupported-capability',
  unknownInstrument: 'unknown-instrument',
  upstreamUnavailable: 'upstream-unavailable',
  protocol: 'protocol',
  internal: 'internal',
} as const

export type StreamErrorCode = (typeof STREAM_ERROR_CODES)[keyof typeof STREAM_ERROR_CODES]

/** 一根 K 线，时间为 UTC 的毫秒时间戳。 */
export interface StreamBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
}

/** 报价：只带最新价与前收，不携带序列。 */
export interface StreamQuote {
  last: number
  prevClose: number
  timestamp: number
}

/** 连接级信封：所有帧共享序号与服务器时间。 */
interface FrameEnvelope {
  seq: number
  ts: number
}

/**
 * V1.1 帧联合。
 *
 * 品种身份只出现在品种级帧上；`hello` 与 `ping` 不携带品种。
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

/** 一条连接承载的品种与序列参数。 */
export interface StreamRequest {
  source: string
  channel: StreamChannel
  instrumentIds: ReadonlyArray<string>
  period?: KLinePeriod
  adjustment?: KLineAdjustment
  barAggregation?: BarAggregation
}

/** 一个逻辑订阅的内容；连接按订阅聚合。 */
export interface StreamSubscriptionRequest {
  source: string
  channel: StreamChannel
  instrumentId: string
  period?: KLinePeriod
  adjustment?: KLineAdjustment
  barAggregation?: BarAggregation
}

/** 连接状态事件；调用方据此更新加载与查询状态。 */
export type StreamEvent =
  | { kind: 'opened'; reconnected: boolean }
  | { kind: 'lost'; reason: string }
  | { kind: 'stopped'; reason: string }

/** 关闭只作为一次失败对象上报，是否重连由连接状态机决定。 */
export interface StreamClose {
  readonly retryable: boolean
  readonly message: string
}

/** 传输回调；不承载业务语义，只上报原始帧与关闭事实。 */
export interface StreamTransportHandlers {
  onOpen(): void
  onFrame(frame: StreamFrame): void
  onClose(close: StreamClose): void
}

/** 一次性传输：打开、关闭，重连不在传输内判断。 */
export interface StreamTransport {
  open(): void
  close(): void
}

/** 传输工厂：按请求与回调建立一次传输。 */
export type StreamTransportFactory = (
  request: StreamRequest,
  handlers: StreamTransportHandlers,
) => StreamTransport

/**
 * 宿主提供的文本事件流回调。
 *
 * 只透传连接打开、原始 `data` 帧和错误，不解析业务协议。
 */
export interface EventStreamHandlers {
  onOpen(): void
  onData(data: string): void
  onError(): void
}

/** 宿主事件流的关闭句柄。 */
export interface EventStream {
  close(): void
}

/**
 * 宿主事件流工厂。
 *
 * 浏览器用 `EventSource`，Node 用 `fetch` 加 `ReadableStream`，库内不再引用任一实现。
 */
export type EventStreamFactory = (url: string, handlers: EventStreamHandlers) => EventStream

/** 订阅句柄：关闭后不再收到任何事件。 */
export interface StreamSubscription {
  readonly request: StreamSubscriptionRequest
  onFrame(callback: (frame: StreamFrame) => void): () => void
  onEvent(callback: (event: StreamEvent) => void): () => void
  close(): void
}

/** 全局唯一的连接入口；负责按订阅聚合与释放连接。 */
export interface StreamHub {
  subscribe(request: StreamSubscriptionRequest): StreamSubscription
  /** 唤醒所有处于退避等待的连接，页面恢复时由宿主调用。 */
  resume(): void
  dispose(): void
}
