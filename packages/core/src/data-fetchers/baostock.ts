import type { DataFetcher, KLineData } from '../controllers/types'

export const baostockDataFetcher: DataFetcher = async (source, config) => {
  console.log(`[baostock] fetching ${config.symbol} ${config.period} ${config.startDate}~${config.endDate}`)
  const baseUrl = source === 'baostock' ? 'http://localhost:8000' : ''
  const adjustMap: Record<string, string> = { qfq: '2', hfq: '1', none: '3' }
const periodMap: Record<string, string> = { daily: 'd', weekly: 'w', monthly: 'm', '5min': '5', '15min': '15', '30min': '30', '60min': '60' }
  const adjustflag = adjustMap[config.adjust] ?? '3'
  const url = `${baseUrl}/api/stock/kdata?stock_code=${config.symbol}&start_date=${config.startDate}&end_date=${config.endDate}&frequency=${periodMap[config.period] ?? 'd'}&adjustflag=${adjustflag}`
  try {
    const res = await fetch(url)
    console.log(res)
    if (!res.ok) {
      throw new Error(`[baostock] fetch failed: ${res.status} ${res.statusText}`)
    }
    const json = await res.json()
    console.log(json)
    return (json.data ?? json).map((item: Record<string, unknown>) => ({
      timestamp: new Date(item.date as string).getTime(),
      date: item.date as string,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume),
      turnover: Number(item.amount ?? 0),
      turnoverRate: item.turn === '' ? 0 : Number(item.turn),
      stockCode: String(item.code ?? config.symbol),
    })) as KLineData[]
  } catch (err) {
    console.warn('[baostock] network error:', err)
    throw err
  }
}
