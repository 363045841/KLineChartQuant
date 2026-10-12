/**
 * 引擎运行契约。
 */
import type { DataFeed, DataFeedRange } from '../contracts/input.js'
import type { OutputSink } from '../contracts/output.js'
import type { IndicatorDef } from '../contracts/script.js'

/** 一次引擎运行的配置。 */
export interface RunOptions<P> {
  /** 要执行的指标。 */
  script: IndicatorDef<P>
  params?: Partial<P>
  /** 行情数据来源。 */
  feed: DataFeed
  /** 结果汇点。 */
  sink: OutputSink
  /** 标的代码。 */
  symbol: string
  /** 周期。 */
  tf: string
  /** 历史时间范围；缺省表示不限制。 */
  range?: DataFeedRange
}

/** 一次引擎运行的结果。 */
export interface RunResult {
  /** 实际执行的 bar 数量。 */
  barCount: number
}
