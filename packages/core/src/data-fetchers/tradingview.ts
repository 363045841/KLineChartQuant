import type { KLineData } from '../controllers/types'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig } from './types'

const PERIOD_TO_TIMEFRAME: Record<string, string> = {
  daily: '1d',
  weekly: '1w',
  monthly: '1M',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '60min': '60m',
}

const ADJUST_TO_TV: Record<string, string | undefined> = {
  qfq: 'dividends',
  splits: 'splits',
  none: 'none',
}

const BASE_URL = 'http://localhost:8000'

async function fetchTradingview(
  _source: string,
  config: FetchConfig,
): Promise<ReadonlyArray<KLineData>> {
  const timeframe = PERIOD_TO_TIMEFRAME[config.period] ?? '1d'
  const startDate = config.startDate.split('T')[0]
  const endDate = config.endDate.split('T')[0]
  const tvAdjust = ADJUST_TO_TV[config.adjust]
  const exchangeQ = config.exchange ? `&exchange=${config.exchange}` : ''
  const adjustQ = tvAdjust ? `&adjust=${tvAdjust}` : ''
  const url = `${BASE_URL}/api/tradingview/kdata?symbol=${config.symbol}&timeframe=${timeframe}&start_date=${startDate}&end_date=${endDate}${exchangeQ}${adjustQ}`
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

@DataFetcher({
  name: 'tradingview',
  displayName: 'TradingView',
  description: 'TradingView-style data source via local proxy',
  version: '1.0.0',
  capabilities: ['daily', 'weekly', 'monthly', '5min', '15min', '30min', '60min'],
})
export class TradingviewFetcher {
  static fetcher = fetchTradingview
}

/** @deprecated Use `TradingviewFetcher.fetcher` directly or rely on routerDataFetcher. */
export const tradingviewDataFetcher = fetchTradingview
