import type { DataFetcher, KLineData } from '../controllers/types'

const PERIOD_TO_TIMEFRAME: Record<string, string> = {
  daily: '1d',
  weekly: '1w',
  monthly: '1M',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '60min': '60m',
}

export const tradingviewDataFetcher: DataFetcher = async (source, config) => {
  const baseUrl = source === 'tradingview' ? 'http://localhost:8000' : ''
  const timeframe = PERIOD_TO_TIMEFRAME[config.period] ?? '1d'
  const startDate = config.startDate.split('T')[0]
  const endDate = config.endDate.split('T')[0]

  const exchangeQ = config.exchange ? `&exchange=${config.exchange}` : ''
  const url = `${baseUrl}/api/tradingview/kdata?symbol=${config.symbol}&timeframe=${timeframe}&start_date=${startDate}&end_date=${endDate}${exchangeQ}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`[tradingview] fetch failed: ${res.status} ${res.statusText}`)
    }
    const json = await res.json()
    if (!json.success) {
      throw new Error(`[tradingview] API error: ${json.error_msg}`)
    }
    if (json.warning) {
      console.warn(`[tradingview] ${json.warning}`)
    }

    return (json.data ?? []).map((item: Record<string, unknown>) => ({
      timestamp: item.ts_open as number,
      date: item.date as string,
      open: item.open as number,
      high: item.high as number,
      low: item.low as number,
      close: item.close as number,
      volume: (item.volume as number) ?? 0,
      stockCode: config.symbol,
    })) as KLineData[]
  } catch (err) {
    console.warn('[tradingview] network error:', err)
    throw err
  }
}
