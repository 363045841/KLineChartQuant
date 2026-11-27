/**
 * 行情数据入口：K 线、分时的唯一形状来自 `bar.ts`，本文件只保留响应包装与视图判别。
 */
import type { KLineData, TimeShareData } from './bar.js'

export type { KLineData, TimeShareData } from './bar.js'

export interface KLineDailyDongCaiResponse extends KLineData {
  symbol: string
  volume: number
  turnover: number
  amplitude: number
  changePercent: number
  changeAmount: number
  turnoverRate: number
}

/** 渲染管线中的单条序列数据：K 线柱或分时点。 */
export type ChartSeriesDatum = KLineData | TimeShareData

/** 按首条数据是否带 price/average 判断分时。 */
export function isTimeShareData(data: unknown[]): data is TimeShareData[] {
  const first = data[0]
  return (
    data.length > 0 &&
    first !== null &&
    typeof first === 'object' &&
    'price' in (first as object) &&
    'average' in (first as object)
  )
}

/** 按首条序列判断是否为 K 线视图数据；分时数据没有 OHLC。 */
export function isKLineDataArray(data: ReadonlyArray<ChartSeriesDatum>): data is KLineData[] {
  const first = data[0]
  return first !== undefined && 'close' in first
}

/** 按首条序列判断是否为分时视图数据；K 线数据没有 price/average。 */
export function isTimeShareDataArray(
  data: ReadonlyArray<ChartSeriesDatum>,
): data is TimeShareData[] {
  const first = data[0]
  return first !== undefined && 'price' in first && 'average' in first
}

/** 把东财日线响应转成标准 K 线并按时间升序排序。 */
export function toKLineData(arr: KLineDailyDongCaiResponse[]): KLineData[] {
  return arr
    .map((e) => ({
      timestamp: e.timestamp,
      open: e.open,
      high: e.high,
      low: e.low,
      close: e.close,
      symbol: e.symbol,
      volume: e.volume,
      turnover: e.turnover,
      amplitude: e.amplitude,
      changePercent: e.changePercent,
      changeAmount: e.changeAmount,
      turnoverRate: e.turnoverRate,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}
