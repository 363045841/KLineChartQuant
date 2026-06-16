import type { KLineData } from '../controllers/types'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig } from './types'

const ADJUST_MAP: Record<string, string> = { qfq: '2', hfq: '1', none: '3' }

const PERIOD_MAP: Record<string, string> = {
  daily: 'd',
  weekly: 'w',
  monthly: 'm',
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '60min': '60',
}

const BASE_URL = 'http://localhost:8000'

async function fetchBaoStock(
  _source: string,
  config: FetchConfig,
): Promise<ReadonlyArray<KLineData>> {
  console.log(
    `[baostock] fetching ${config.symbol} ${config.period} ${config.startDate}~${config.endDate}`,
  )
  const url = `${BASE_URL}/api/stock/kdata?stock_code=${config.symbol}&start_date=${config.startDate}&end_date=${config.endDate}&frequency=${PERIOD_MAP[config.period] ?? 'd'}&adjustflag=${ADJUST_MAP[config.adjust] ?? '3'}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`[baostock] fetch failed: ${res.status} ${res.statusText}`)
    }
    const json = await res.json()
    return (json.data ?? json).map(
      (item: Record<string, unknown>) =>
        ({
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
        }) as KLineData,
    )
  } catch (err) {
    console.warn('[baostock] network error:', err)
    throw err
  }
}

@DataFetcher({
  name: 'baostock',
  displayName: 'BaoStock',
  description: 'BaoStock data source via local proxy',
  version: '1.0.0',
  capabilities: ['daily', 'weekly', 'monthly', '5min', '15min', '30min', '60min'],
})
export class BaoStockFetcher {
  static fetcher = fetchBaoStock
}

/** @deprecated Use `BaoStockFetcher.fetcher` directly or rely on routerDataFetcher. */
export const baostockDataFetcher = fetchBaoStock
