import type { KLineData, TimeShareData } from '../controllers/types'
import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig, TimeShareFetchConfig } from './types'

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

const BASE_URL = 'http://127.0.0.1:8080'

const MORNING_SESSION_MINUTES = 120

interface TickItem {
  Price: number
  Avg: number
  Vol: number
}

function computeTickTimestamp(index: number, today: Date): number {
  const d = new Date(today)
  if (index < MORNING_SESSION_MINUTES) {
    d.setHours(9, 30 + index, 0, 0)
  } else {
    d.setHours(13, 0 + (index - MORNING_SESSION_MINUTES), 0, 0)
  }
  return d.getTime()
}

function getShanghaiToday(): Date {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  let y = '', m = '', d = ''
  for (const p of parts) {
    if (p.type === 'year') y = p.value
    else if (p.type === 'month') m = p.value
    else if (p.type === 'day') d = p.value
  }
  return new Date(+y, +m - 1, +d)
}

function getMarket(code: string): number {
  if (code.startsWith('6') || code.startsWith('9')) return 1
  return 0
}

async function fetchGotdxTimeShare(
  _source: string,
  config: TimeShareFetchConfig,
): Promise<ReadonlyArray<TimeShareData>> {
  const market = getMarket(config.symbol)
  const body = { market, code: config.symbol, start: config.start ?? 0, count: config.count ?? 240 }
  const res = await fetch(`${BASE_URL}/api/stock/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`[gotdx] tick failed: ${res.status} ${res.statusText}`)
  const list: TickItem[] = await res.json()
  const today = getShanghaiToday()
  return list.map((item, i) => ({
    timestamp: computeTickTimestamp(i, today),
    price: item.Price,
    average: item.Avg,
    volume: item.Vol,
    amount: item.Price * item.Vol,
  }))
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
    stockCode: code,
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
    stockCode: code,
  }
}

async function fetchGotdx(
  _source: string,
  config: FetchConfig,
): Promise<ReadonlyArray<KLineData>> {
  if (config.exchange && config.exchange in EXCHANGE_EX_CATEGORY) {
    const category = EXCHANGE_EX_CATEGORY[config.exchange]
    const period = PERIOD_TO_CATEGORY[config.period] ?? 4
    const body = {
      category,
      code: config.symbol,
      period,
      start_date: config.startDate,
      end_date: config.endDate,
      times: 1,
    }
    const res = await fetch(`${BASE_URL}/api/ex/kline-by-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`[gotdx] ex/kline-by-date failed: ${res.status} ${res.statusText}`)
    const list: ExKLineItem[] = await res.json()
    return list.map((item) => mapExItem(item, config.symbol))
  }

  const market = config.symbol.startsWith('6') || config.symbol.startsWith('9') ? 1 : 0
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
  const res = await fetch(`${BASE_URL}/api/stock/kline-by-date`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`[gotdx] stock/kline-by-date failed: ${res.status} ${res.statusText}`)
  const list: SecurityBar[] = await res.json()
  return list.map((item) => mapBar(item, config.symbol))
}

@DataFetcher({
  name: 'gotdx',
  displayName: 'GOTDX',
  description: 'TDX data source via local proxy',
  version: '1.0.0',
  capabilities: [
    '1min', '5min', '15min', '30min', '60min',
    'daily', 'weekly', 'monthly', 'quarterly', 'yearly',
  ],
})
class GotdxFetcher {
  static fetcher = fetchGotdx
  static timeShareFetcher = fetchGotdxTimeShare
}

/** @deprecated Use `GotdxFetcher.fetcher` directly or rely on routerDataFetcher. */
const gotdxDataFetcher = fetchGotdx