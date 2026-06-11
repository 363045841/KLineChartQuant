import type { DataFetcher, KLineData } from '../controllers/types'

export const baostockDataFetcher: DataFetcher = async (source, config) => {
  const baseUrl = source === 'baostock' ? 'http://localhost:8000' : ''
  const url = `${baseUrl}/api/stock/kline?symbol=${config.symbol}.${config.adjust}&start=${config.startDate}&end=${config.endDate}&period=${config.period}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`baostock fetch failed: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return (json.data ?? json).map((item: Record<string, unknown>) => ({
    timestamp: new Date(item.date as string).getTime(),
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: Number(item.volume),
    turnover: Number(item.amount ?? item.turnover),
    stockCode: String(item.code ?? config.symbol),
  })) as KLineData[]
}
