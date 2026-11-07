/** Worker 私有传输契约；领域对象只在计算端与消费端存在，通信使用增量数值块。 */
import type {
  DrawingObject,
  OhlcPlot,
  PlotCollection,
  ScalarPlot,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptRequestContext } from '../../request/types.js'

/** 行情增量：prepended 表示在旧首根之前插入的根数；count 为本块根数。 */
export interface BarPatch {
  /** 新序列中本块的起点。 */
  readonly start: number
  /** 本块根数。 */
  readonly count: number
  /** 新序列总长度。 */
  readonly length: number
  /** 在旧首根之前插入的根数；其它情况为 0。 */
  readonly prepended: number
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
  readonly offset: number
  readonly length: number
} & (
  | { readonly type: 'scalar'; readonly metadata: PlotMetadata<ScalarPlot> }
  | { readonly type: 'ohlc'; readonly metadata: PlotMetadata<OhlcPlot> }
)

/** 大量 PVP 矩形共用声明；ID、层次和锚点独立放在数值块。 */
export type DrawingMetadata = Omit<DrawingObject, 'id' | 'zIndex' | 'anchors'>
export interface PackedPlotCollection extends Omit<PlotCollection, 'plots' | 'fills' | 'drawings'> {
  readonly buffer: ArrayBuffer
  readonly strings: readonly string[]
  readonly plots: readonly PackedPlot[]
  readonly fills: readonly (Omit<PlotCollection['fills'][number], 'colors'> & {
    readonly offset: number
    readonly length: number
  })[]
  readonly drawings?: {
    readonly offset: number
    readonly length: number
    readonly metadata: readonly DrawingMetadata[]
  }
}
