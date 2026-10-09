/** Footprint 的计算与渲染契约；柱子以实际 K 线开盘时间寻址，数值口径由 metric 决定。 */
import type { TradeStatus } from '../../data/trades/types.js'

/** 足迹数值口径：成交量（base asset）或成交额（价 × 量，quote asset）。 */
export const FOOTPRINT_METRICS = {
  Volume: 'volume',
  Turnover: 'turnover',
} as const
export type FootprintMetric = (typeof FOOTPRINT_METRICS)[keyof typeof FOOTPRINT_METRICS]
export const FOOTPRINT_METRIC_OPTIONS = [
  { value: FOOTPRINT_METRICS.Volume, label: '成交量' },
  { value: FOOTPRINT_METRICS.Turnover, label: '成交额' },
]

export interface FootprintParams {
  readonly ticksPerRow: number
  readonly imbalanceRatio: number
  readonly metric: FootprintMetric
}
/** 文本模式只影响展示，不参与成交额计算。 */
export const FOOTPRINT_TEXT_MODES = {
  Volume: 'volume',
  Delta: 'delta',
  BidAsk: 'bidAsk',
} as const
export type FootprintTextMode = (typeof FOOTPRINT_TEXT_MODES)[keyof typeof FOOTPRINT_TEXT_MODES]
export const FOOTPRINT_TEXT_OPTIONS = [
  { value: FOOTPRINT_TEXT_MODES.Volume, label: 'Volume' },
  { value: FOOTPRINT_TEXT_MODES.Delta, label: 'Delta' },
  { value: FOOTPRINT_TEXT_MODES.BidAsk, label: 'Bid Ask' },
]
export interface FootprintCell {
  readonly price: string
  /** 主动卖成交汇总；单位由 FootprintParams.metric 决定。 */
  readonly bid: string
  /** 主动买成交汇总；单位由 FootprintParams.metric 决定。 */
  readonly ask: string
  readonly bidImbalance: boolean
  readonly askImbalance: boolean
}
export interface FootprintBar {
  readonly timestamp: number
  readonly cells: readonly FootprintCell[]
  readonly delta: string
  readonly total: string
  readonly complete: boolean
}
export interface FootprintSeries {
  /** 未闭合柱的完整性截至该输入水位，不依赖 calculator 执行时钟。 */
  readonly asOf: number
  readonly rowSize: string
  readonly bars: readonly (FootprintBar | undefined)[]
  readonly status: TradeStatus
  readonly message: string | null
}
export interface FootprintRenderState {
  readonly textMode?: FootprintTextMode
  readonly series: FootprintSeries
  readonly timestamp: number
}
