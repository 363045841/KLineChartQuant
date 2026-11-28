/** Worker 私有传输契约；领域对象只在计算端与消费端存在，通信使用数值块。 */
import type {
  ComputeChange,
  DrawingObject,
  IndicatorSeries,
  OhlcPlot,
  ScalarPlot,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptRequestContext } from '../../request/types.js'

/** 行情增量：从变化起点到序列末尾的一段数值块。 */
export interface BarPatch {
  readonly change: ComputeChange
  /** 新序列总长度。 */
  readonly length: number
  /** bars[change.start, length) 的数值块。 */
  readonly buffer: ArrayBuffer
}

export interface RunInputPatch {
  readonly bars: BarPatch
  readonly context?: Omit<ScriptRequestContext, 'snapshots'> & {
    readonly snapshots: readonly { readonly id: string; readonly bars: BarPatch }[]
  }
}

/** 分布式 Omit 保留每一种 Plot 自己的声明字段。 */
type PlotMetadata<T> = T extends unknown ? Omit<T, 'data'> : never
export type PackedPlot = {
  /** 本次携带的起始下标；之前的点沿用消费端已有值。 */
  readonly start: number
  /** 完整列长度。 */
  readonly length: number
  readonly offset: number
} & (
  | { readonly type: 'scalar'; readonly metadata: PlotMetadata<ScalarPlot> }
  | { readonly type: 'ohlc'; readonly metadata: PlotMetadata<OhlcPlot> }
)

/** 大量 PVP 矩形共用声明；ID、层次和锚点独立放在数值块。 */
export type DrawingMetadata = Omit<DrawingObject, 'id' | 'zIndex' | 'anchors'>
export interface PackedIndicatorSeries
  extends Omit<IndicatorSeries, 'plots' | 'fills' | 'drawings'> {
  readonly buffer: ArrayBuffer
  readonly strings: readonly string[]
  readonly plots: readonly PackedPlot[]
  readonly fills: readonly (Omit<IndicatorSeries['fills'][number], 'colors'> & {
    readonly start: number
    readonly offset: number
    readonly length: number
  })[]
  readonly drawings?: {
    readonly offset: number
    readonly length: number
    readonly metadata: readonly DrawingMetadata[]
  }
}
