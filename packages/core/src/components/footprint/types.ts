/** Footprint 的计算与渲染契约；柱子以实际 K 线开盘时间寻址。 */
import type { TradeStatus } from '../../data/trades/types.js'

export interface FootprintParams {
  readonly ticksPerRow: number
  readonly imbalanceRatio: number
}
export interface FootprintCell {
  readonly price: string
  readonly bidVolume: string
  readonly askVolume: string
  readonly bidImbalance: boolean
  readonly askImbalance: boolean
}
export interface FootprintBar {
  readonly timestamp: number
  readonly cells: readonly FootprintCell[]
  readonly delta: string
  readonly totalVolume: string
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
  readonly series: FootprintSeries
  readonly timestamp: number
}
