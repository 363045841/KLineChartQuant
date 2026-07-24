import type { KLineData, TimeShareData } from '../controllers/types'
import { KLineChartError } from '../errors'

import { getFetcherBaseUrl } from './fetcherBaseUrl'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig, SearchConfig, SearchResult, TimeShareFetchConfig } from './types'

const PERIOD_TO_CATEGORY: Record<string, number> = {
  '1min': 8,
  '5min': 0,
  '15min': 1,
  '30min': 2,
  '60min': 3,
  daily: 4,
  weekly: 5,
  monthly: 6,
  quarterly: 10,
  yearly: 11,
}

const ADJUST_MAP: Record<string, number> = {
  none: 0,
  qfq: 1,
  hfq: 2,
  splits: 0,
}

const EXCHANGE_EX_CATEGORY: Record<string, number> = {
  US: 74,
  HK: 71,
  SG: 78,
  DE: 73,
}

/** GOTDX 本地代理默认地址；运行时由聚合源面板覆盖 */
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'

function getBaseUrl(): string {
  return getFetcherBaseUrl('gotdx', DEFAULT_BASE_URL)
}

function getShanghaiDateYYYYMMDD(): number {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  let y = '',
    m = '',
    d = ''
  for (const p of parts) {
    if (p.type === 'year') y = p.value
    else if (p.type === 'month') m = p.value
    else if (p.type === 'day') d = p.value
  }
  return +y * 10000 + +m * 100 + +d
}

async function fetchGotdxHistoryTick(
  _source: string,
  config: TimeShareFetchConfig,
): Promise<ReadonlyArray<TimeShareData>> {
  const body = {
    date: config.date ?? getShanghaiDateYYYYMMDD(),
    market:
      typeof config.params?.market === 'number'
        ? config.params.market
        : config.symbol.startsWith('6') || config.symbol.startsWith('9')
          ? 1
          : 0,
    code: config.symbol,
  }
  const res = await fetch(`${getBaseUrl()}/api/stock/history-tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] history-tick failed: ${res.status} ${res.statusText}`,
    )
  const list: Array<{ timestamp: string; Price: number; Avg: number; Vol: number }> =
    await res.json()
  return list.map((item) => ({
    timestamp: new Date(item.timestamp).getTime(),
    price: item.Price,
    average: item.Avg,
    volume: item.Vol,
    amount: item.Price * item.Vol,
  }))
}

async function searchGotdx(
  _source: string,
  config: SearchConfig,
): Promise<ReadonlyArray<SearchResult>> {
  const res = await fetch(`${getBaseUrl()}/api/symbol/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: config.query, limit: config.limit }),
    signal: config.signal,
  })
  if (!res.ok) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] symbol search failed: ${res.status} ${res.statusText}`,
    )
  }
  return (await res.json()) as ReadonlyArray<SearchResult>
}

interface SecurityBar {
  Last: number
  Open: number
  Close: number
  High: number
  Low: number
  Vol: number
  Amount: number
  Turnover: number
  RisePrice: number
  RiseRate: number
  Amplitude: number
  Year: number
  Month: number
  Day: number
  Hour: number
  Minute: number
  DateTime: string
  UpCount: number
  DownCount: number
}

interface ExKLineItem {
  DateTime: string
  Open: number
  High: number
  Low: number
  Close: number
  Amount: number
  Vol: number
}

function mapBar(item: SecurityBar, code: string): KLineData {
  const ts = new Date(item.DateTime).getTime()
  return {
    timestamp: ts,
    date: item.DateTime.split('T')[0],
    open: item.Open,
    high: item.High,
    low: item.Low,
    close: item.Close,
    volume: item.Vol,
    turnover: item.Amount,
    turnoverRate: item.Turnover,
    changeAmount: item.RisePrice,
    changePercent: item.RiseRate,
    amplitude: item.Amplitude,
    symbol: code,
  }
}

function mapExItem(item: ExKLineItem, code: string): KLineData {
  const ts = new Date(item.DateTime).getTime()
  return {
    timestamp: ts,
    date: item.DateTime.split('T')[0],
    open: item.Open,
    high: item.High,
    low: item.Low,
    close: item.Close,
    volume: item.Vol,
    turnover: item.Amount,
    symbol: code,
  }
}

async function fetchGotdx(_source: string, config: FetchConfig): Promise<ReadonlyArray<KLineData>> {
  const explicitCategory = config.params?.category
  if (
    typeof explicitCategory === 'number' ||
    (config.exchange && config.exchange in EXCHANGE_EX_CATEGORY)
  ) {
    const category =
      typeof explicitCategory === 'number'
        ? explicitCategory
        : EXCHANGE_EX_CATEGORY[config.exchange as string]
    const period = PERIOD_TO_CATEGORY[config.period] ?? 4
    const body = {
      category,
      code: config.symbol,
      period,
      start_date: config.startDate,
      end_date: config.endDate,
      times: 1,
    }
    const res = await fetch(`${getBaseUrl()}/api/ex/kline-by-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok)
      throw new KLineChartError(
        'FETCH_FAILED',
        `[gotdx] ex/kline-by-date failed: ${res.status} ${res.statusText}`,
      )
    const list: ExKLineItem[] = await res.json()
    return list.map((item) => mapExItem(item, config.symbol))
  }

  const market =
    typeof config.params?.market === 'number'
      ? config.params.market
      : config.symbol.startsWith('6') || config.symbol.startsWith('9')
        ? 1
        : 0
  const category = PERIOD_TO_CATEGORY[config.period] ?? 4
  const adjust = ADJUST_MAP[config.adjust] ?? 0
  const body = {
    market,
    code: config.symbol,
    category,
    start_date: config.startDate,
    end_date: config.endDate,
    times: 1,
    adjust,
  }
  const res = await fetch(`${getBaseUrl()}/api/stock/kline-by-date`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] stock/kline-by-date failed: ${res.status} ${res.statusText}`,
    )
  const list: SecurityBar[] = await res.json()
  return list.map((item) => mapBar(item, config.symbol))
}

@DataFetcher({
  name: 'gotdx',
  displayName: 'GOTDX',
  description: 'TDX data source via local proxy',
  version: '1.0.0',
  defaultBaseUrl: DEFAULT_BASE_URL,
  capabilities: [
    '1min',
    '5min',
    '15min',
    '30min',
    '60min',
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
    'search',
  ],
})
class GotdxFetcher {
  static fetcher = fetchGotdx
  static timeShareFetcher = fetchGotdxHistoryTick
  static searcher = searchGotdx
}
