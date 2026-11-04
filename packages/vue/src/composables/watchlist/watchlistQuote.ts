/** 自选报价快照契约：实时帧投影后的展示值，包含本次更新的涨跌方向。 */

/** 涨跌方向；与主题的 positive / negative / neutral 语义一一对应。 */
export type QuoteDirection = 'up' | 'down' | 'flat'

/** 自选行展示的报价快照。 */
export interface WatchlistQuote {
  last: number
  prevClose: number
  timestamp: number
  /** 相对上一次展示的最新价（首帧相对昨收）的方向；价格没变时沿用上一次方向。 */
  direction: QuoteDirection
}
