/** 实时 K 线流的领域契约：数据源创建流，消费端订阅帧并控制其生命周期。 */
import type { BarAggregation } from '../provider/types.js'

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
  | { type: 'snapshot'; symbol: string; period: string; bars: LiveBar[] }
  | { type: 'forming'; symbol: string; period: string; bar: LiveBar }
  | { type: 'closed'; symbol: string; period: string; bar: LiveBar }
  | { type: 'status'; symbol: string; period: string; status: string; detail?: string }

/** 实时流的连接状态。 */
export type LiveBarsStatus = 'connecting' | 'connected' | 'disconnected'

/** 创建一个数据源实时 K 线流所需的序列身份。 */
export interface LiveBarsRequest {
  symbol: string
  period: string
  barAggregation: BarAggregation
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
