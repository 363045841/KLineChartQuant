import type { KLineData } from '../controllers/types'
import { KLineChartError } from '../errors'

import { getFetcherBaseUrl } from './fetcherBaseUrl'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type {
  FetchConfig,
  SearchConfig,
  SearchResult,
  TimeShareFetchConfig,
  TimeShareFetchResult,
} from './types'

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
): Promise<TimeShareFetchResult> {
  // 分时只认搜索/目录带来的 params.market，不按代码前缀猜市场
  if (typeof config.params?.market !== 'number') {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] history-tick requires params.market for ${config.symbol}`,
    )
  }
  const body = {
    date: config.date ?? getShanghaiDateYYYYMMDD(),
    market: config.params.market,
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
  const payload: unknown = await res.json()
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new KLineChartError(
      'FETCH_FAILED',
      '[gotdx] incompatible history-tick response: expected { preClose, data }',
    )
  }

  const { preClose, data: list } = payload as {
    preClose?: unknown
    data?: unknown
  }
  if (
    typeof preClose !== 'number' ||
    !Number.isFinite(preClose) ||
    preClose <= 0 ||
    !Array.isArray(list)
  ) {
    throw new KLineChartError(
      'FETCH_FAILED',
      '[gotdx] incompatible history-tick response: expected positive preClose and data array',
    )
  }

  return {
    preClose,
    data: (list as Array<{ timestamp: string; Price: number; Avg: number; Vol: number }>).map(
      (item) => ({
        timestamp: new Date(item.timestamp).getTime(),
        price: item.Price,
        average: item.Avg,
        volume: item.Vol,
        amount: item.Price * item.Vol,
      }),
    ),
  }
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
  // 路由只看 params：有 category 走扩展行情，有 market 走 A 股；不做代码/exchange 猜测
  const explicitCategory = config.params?.category
  if (typeof explicitCategory === 'number') {
    const period = PERIOD_TO_CATEGORY[config.period] ?? 4
    const body = {
      category: explicitCategory,
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

  if (typeof config.params?.market !== 'number') {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] stock kline requires params.market or params.category for ${config.symbol}`,
    )
  }
  const market = config.params.market
  const category = PERIOD_TO_CATEGORY[config.period] ?? 4
  const adjust = ADJUST_MAP[config.adjust] ?? 0
  // kind 原样传给胶水层：index → GetIndexBars，stock → StockKLine
  const kind =
    typeof config.params.kind === 'string' ? config.params.kind : undefined
  const body = {
    market,
    code: config.symbol,
    category,
    start_date: config.startDate,
    end_date: config.endDate,
    times: 1,
    adjust,
    ...(kind ? { kind } : {}),
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
