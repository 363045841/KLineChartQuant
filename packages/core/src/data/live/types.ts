/** 实时 K 线流的领域契约：数据源创建流，消费端订阅帧并控制其生命周期。 */
import type { BarAggregation, KLineAdjustment } from '../provider/types.js'

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

/** 数据源实时 K 线帧协议。 */
export type LiveBarsFrame =
  | { type: 'update'; symbol: string; period: string; bar: LiveBar }
  | { type: 'historical'; symbol: string; period: string; bar: LiveBar }
  | { type: 'invalidate'; symbol: string; period: string }
  | { type: 'snapshot'; symbol: string; period: string; bars: LiveBar[] }
  | { type: 'forming'; symbol: string; period: string; bar: LiveBar }
  | { type: 'closed'; symbol: string; period: string; bar: LiveBar }
  | { type: 'status'; symbol: string; period: string; status: string; detail?: string }

/** 实时流的连接状态。 */
export type LiveBarsStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * 创建一个数据源实时 K 线流所需的序列身份。
 *
 * `symbol` 只是展示代码，不保证跨交易所唯一；能提供精确身份的调用方必须带上
 * `instrumentId`，否则服务端只能靠目录猜测并在同名代码上拒绝订阅。
 */
export interface LiveBarsRequest {
  symbol: string
  period: string
  barAggregation: BarAggregation
  /** Connector 的稳定品种 ID；有它就无需服务端再解析 symbol。 */
  instrumentId?: string
  /** 交易所缩写；缺少 instrumentId 时用于消歧。 */
  exchange?: string
  /** 复权方式；服务端默认 none，hfq 必须显式声明才能得到复权后的实时尾部。 */
  adjustment?: KLineAdjustment
}

/** 实时 K 线流的统一生命周期接口。 */
export interface LiveBarsStream {
  onFrame(callback: (frame: LiveBarsFrame) => void): () => void
  onStatus(callback: (status: LiveBarsStatus) => void): () => void
  onError(callback: (error: Error) => void): () => void
  connect(): void
  disconnect(): void
  destroy(): void
}

/** 数据源创建自身实时 K 线流的能力。 */
export interface LiveBarsDataSource {
  createStream(request: LiveBarsRequest): LiveBarsStream
}
