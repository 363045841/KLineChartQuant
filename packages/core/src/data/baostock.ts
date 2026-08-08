import type { KLineData } from '../controllers/types'
import { KLineChartError } from '../errors'

import { createHttpMarketDataV1Transport, createV1MarketDataProvider } from './marketData/api'
import { marketDataProviderRegistry } from './marketData/providerRegistry'
import { dataSourceRegistry } from './marketData/sourceRegistry'
import { getFetcherBaseUrl } from './fetcherBaseUrl'
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

/** BaoStock 本地代理默认地址；运行时由聚合源面板覆盖 */
const DEFAULT_BASE_URL = 'http://localhost:8000'

async function fetchBaoStock(
  _source: string,
  config: FetchConfig,
): Promise<ReadonlyArray<KLineData>> {
  console.log(
    `[baostock] fetching ${config.symbol} ${config.period} ${config.startDate}~${config.endDate}`,
  )
  const baseUrl = getFetcherBaseUrl('baostock', DEFAULT_BASE_URL)
  const url = `${baseUrl}/api/stock/kdata?stock_code=${config.symbol}&start_date=${config.startDate}&end_date=${config.endDate}&frequency=${PERIOD_MAP[config.period] ?? 'd'}&adjustflag=${ADJUST_MAP[config.adjust] ?? '3'}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new KLineChartError(
        'FETCH_FAILED',
        `[baostock] fetch failed: ${res.status} ${res.statusText}`,
      )
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
          symbol: String(item.code ?? config.symbol),
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
  defaultBaseUrl: DEFAULT_BASE_URL,
  capabilities: ['daily', 'weekly', 'monthly', '5min', '15min', '30min', '60min'],
})
class BaoStockFetcher {
  static fetcher = fetchBaoStock
}

/** @deprecated Use `BaoStockFetcher.fetcher` directly or rely on routerDataFetcher. */
export const baostockDataFetcher = fetchBaoStock

const BAOSTOCK = dataSourceRegistry.baostock

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const v1Transport = createHttpMarketDataV1Transport({
  baseUrl: () => marketDataProviderRegistry.getConfig('baostock').baseUrl ?? BAOSTOCK.defaultBaseUrl,
  sourceLabel: 'baostock',
})

/** BaoStock V1 Provider：通过统一行情协议访问 BaoStock 代理。 */
export const baostockMarketDataProvider = createV1MarketDataProvider({
  source: {
    id: BAOSTOCK.id,
    displayName: BAOSTOCK.displayName,
    description: BAOSTOCK.description,
    defaultBaseUrl: BAOSTOCK.defaultBaseUrl,
  },
  transport: v1Transport,
})

// 模块加载副作用：把 baostock Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('baostock')) {
  marketDataProviderRegistry.register(baostockMarketDataProvider)
}
