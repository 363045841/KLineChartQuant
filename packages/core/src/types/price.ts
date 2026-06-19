export interface KLineData {
  /* 时间戳（毫秒） */
  timestamp: number
  /** 日期字符串（如 "2025-06-16"），用于跨品种精确匹配 */
  date?: string
  /* 开盘价 */
  open: number
  /* 最高价 */
  high: number
  /* 最低价 */
  low: number
  /* 收盘价 */
  close: number
  /** 股票代码（东财等数据源会提供） */
  stockCode?: string
  /** 成交量 */
  volume?: number
  /** 成交额 */
  turnover?: number
  /** 振幅 */
  amplitude?: number
  /** 涨跌幅 */
  changePercent?: number
  /** 涨跌额 */
  changeAmount?: number
  /** 换手率 */
  turnoverRate?: number
}

export interface KLineDailyDongCaiResponse extends KLineData {
  stockCode: string
  volume: number
  turnover: number
  amplitude: number
  changePercent: number
  changeAmount: number
  turnoverRate: number
}


export interface TimeShareData {
  timestamp: number
  price: number
  average: number
  volume: number
  amount: number
}

export function isTimeShareData(data: unknown[]): data is TimeShareData[] {
  const first = data[0]
  return data.length > 0 && first !== null && typeof first === 'object' && 'price' in (first as object) && 'average' in (first as object)
}

export function toKLineData(arr: KLineDailyDongCaiResponse[]): KLineData[] {
  return arr
    .map((e) => ({
      timestamp: e.timestamp,
      open: e.open,
      high: e.high,
      low: e.low,
      close: e.close,
      stockCode: e.stockCode,
      volume: e.volume,
      turnover: e.turnover,
      amplitude: e.amplitude,
      changePercent: e.changePercent,
      changeAmount: e.changeAmount,
      turnoverRate: e.turnoverRate,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}
