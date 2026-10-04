/** K 线比较叠加契约：主品种 OHLC 范围、共同基准与比较品种等价价格。 */
import type { KLineData } from '../../foundation/types/price.js'

/** 按完整品种身份索引的行情快照。 */
export type ComparisonData = ReadonlyMap<string, ReadonlyArray<KLineData>>

/** 当前可见区内一个品种的投影，null 保留真实数据缺口。 */
export interface ComparisonSeriesProjection {
  readonly identity: string
  readonly baselineIndex: number
  readonly baselineClose: number
  readonly points: ReadonlyArray<{ readonly index: number; readonly price: number | null }>
}

/** 主品种 K 线、比较折线、百分比轴和基准线共用的单帧投影。 */
export interface ComparisonProjection {
  readonly baselineIndex: number
  readonly basePrice: number
  readonly min: number
  readonly max: number
  readonly series: ReadonlyArray<ComparisonSeriesProjection>
}
