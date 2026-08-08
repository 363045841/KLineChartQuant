import type { KLineData } from '../controllers/types'
import { KLineChartError } from '../errors'

import { createHttpMarketDataV1Transport, createV1MarketDataProvider } from './marketData/api'
import { marketDataProviderRegistry } from './marketData/providerRegistry'
import { dataSourceRegistry } from './marketData/sourceRegistry'
import { getFetcherBaseUrl } from './fetcherBaseUrl'
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

/** TradingView 本地代理默认地址；运行时由聚合源面板覆盖 */
const DEFAULT_BASE_URL = 'http://localhost:8000'

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
  const baseUrl = getFetcherBaseUrl('tradingview', DEFAULT_BASE_URL)
  const url = `${baseUrl}/api/tradingview/kdata?symbol=${config.symbol}&timeframe=${timeframe}&start_date=${startDate}&end_date=${endDate}${exchangeQ}${adjustQ}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new KLineChartError(
        'FETCH_FAILED',
        `[tradingview] fetch failed: ${res.status} ${res.statusText}`,
      )
    }
    const json = await res.json()
    if (!json.success) {
      throw new KLineChartError('FETCH_FAILED', `[tradingview] API error: ${json.error_msg}`)
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
      symbol: config.symbol,
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
  defaultBaseUrl: DEFAULT_BASE_URL,
  capabilities: ['daily', 'weekly', 'monthly', '5min', '15min', '30min', '60min'],
})
class TradingviewFetcher {
  static fetcher = fetchTradingview
}

/** @deprecated Use `TradingviewFetcher.fetcher` directly or rely on routerDataFetcher. */
const tradingviewDataFetcher = fetchTradingview

const TRADINGVIEW = dataSourceRegistry.tradingview

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const v1Transport = createHttpMarketDataV1Transport({
  baseUrl: () =>
    marketDataProviderRegistry.getConfig('tradingview').baseUrl ?? TRADINGVIEW.defaultBaseUrl,
  sourceLabel: 'tradingview',
})

/** TradingView V1 Provider：通过统一行情协议访问本地代理。 */
export const tradingviewMarketDataProvider = createV1MarketDataProvider({
  source: {
    id: TRADINGVIEW.id,
    displayName: TRADINGVIEW.displayName,
    description: TRADINGVIEW.description,
    defaultBaseUrl: TRADINGVIEW.defaultBaseUrl,
  },
  // TradingView 返回原始成交量（股），不按 CN 会话兜底为手
  resolveVolumeUnit: () => undefined,
  transport: v1Transport,
})

// 模块加载副作用：把 tradingview Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('tradingview')) {
  marketDataProviderRegistry.register(tradingviewMarketDataProvider)
}
