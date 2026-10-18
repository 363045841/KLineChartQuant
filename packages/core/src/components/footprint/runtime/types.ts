/** 足迹主序列计算契约；与指标定义、实例及结果池无关。 */
import type { TradeSnapshot } from '@/data/trades/types.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { FootprintParams, FootprintSeries, FootprintTextMode } from '../types.js'

/** 主品种、周期、计算参数与成交组成的一次不可变输入。 */
export interface FootprintInput {
  readonly marketKey: string
  readonly data: readonly KLineData[]
  readonly params: FootprintParams
  readonly trades: TradeSnapshot
}

/** 结果携带原始输入身份，切品种和周期后不能被旧异步结果覆盖。 */
export interface FootprintResult {
  readonly input: FootprintInput
  readonly series: FootprintSeries
}

/** 计算参数与展示参数分开；切换文字不触发成交聚合。 */
export interface FootprintOptions {
  readonly params: FootprintParams
  readonly textMode: FootprintTextMode
}

/** Worker 成交传输只携带新增批次；历史修订使用整段替换。 */
export interface FootprintTradeDiff {
  readonly mode: 'append' | 'replace'
  readonly snapshot: TradeSnapshot
}

export interface FootprintWorkerRequest {
  readonly requestId: number
  readonly marketKey: string
  readonly data: readonly KLineData[]
  readonly params: FootprintParams
  readonly trades: FootprintTradeDiff
}

export type FootprintWorkerResponse =
  | { readonly requestId: number; readonly series: FootprintSeries }
  | { readonly requestId: number; readonly error: string }
