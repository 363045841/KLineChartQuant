import type { KLineData, TimeShareData } from '../controllers/types'
import { KLineChartError } from '../errors'
import { MarketSessionRegistry } from '../engine/market/marketSessionRegistry'

import { getFetcherBaseUrl } from './fetcherBaseUrl'
import { DataFetcher } from './fetcherDefinitionRegistry'
import { marketDataProviderRegistry } from './marketData/providerRegistry'
import type {
  AssetClass,
  InstrumentCapabilities,
  InstrumentDescriptor,
  KLinePeriod,
  MarketDataProvider,
  VolumeUnit,
} from './marketData/types'
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

/** GOTDX 当前可转换到前端标准模型的全部 K 线周期。 */
const GOTDX_KLINE_PERIODS: ReadonlyArray<KLinePeriod> = [
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
]

const GOTDX_MARKET_SESSIONS = new MarketSessionRegistry()

/** GOTDX 本地代理默认地址；运行时由聚合源面板覆盖 */
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'

function getBaseUrl(): string {
  const providerBaseUrl = marketDataProviderRegistry.get('gotdx')
    ? marketDataProviderRegistry.getConfig('gotdx').baseUrl
    : undefined
  return providerBaseUrl ?? getFetcherBaseUrl('gotdx', DEFAULT_BASE_URL)
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

function parseHistoryTickPayload(payload: unknown): TimeShareFetchResult {
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
    data: (
      list as Array<{
        timestamp: string
        Price: number
        Avg: number
        Volume?: unknown
        Amount?: unknown
      }>
    ).map((item) => {
      const point: TimeShareData = {
        timestamp: new Date(item.timestamp).getTime(),
        price: item.Price,
        average: item.Avg,
      }
      if (typeof item.Volume === 'number' && Number.isFinite(item.Volume) && item.Volume >= 0) {
        point.volume = item.Volume
      }
      if (typeof item.Amount === 'number' && Number.isFinite(item.Amount) && item.Amount >= 0) {
        point.amount = item.Amount
      }
      return point
    }),
  }
}

async function historyTickHttpError(res: Response, fallback: string): Promise<KLineChartError> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error.trim()) {
      return new KLineChartError('FETCH_FAILED', body.error.trim())
    }
  } catch {
    // 非 JSON 体时用 HTTP 状态文案
  }
  return new KLineChartError('FETCH_FAILED', fallback)
}

async function fetchGotdxHistoryTick(
  _source: string,
  config: TimeShareFetchConfig,
): Promise<TimeShareFetchResult> {
  // 分时只认搜索/目录带来的 params：category 走扩展，market 走 A 股；不按代码前缀猜
  const date = config.date ?? getShanghaiDateYYYYMMDD()
  const explicitCategory = config.params?.category
  if (typeof explicitCategory === 'number') {
    const body = {
      date,
      category: explicitCategory,
      code: config.symbol,
    }
    const res = await fetch(`${getBaseUrl()}/api/ex/history-tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw await historyTickHttpError(
        res,
        `[gotdx] ex/history-tick failed: ${res.status} ${res.statusText}`,
      )
    }
    return parseHistoryTickPayload(await res.json())
  }

  if (typeof config.params?.market !== 'number') {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] history-tick requires params.market or params.category for ${config.symbol}`,
    )
  }
  const body = {
    date,
    market: config.params.market,
    code: config.symbol,
  }
  const res = await fetch(`${getBaseUrl()}/api/stock/history-tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await historyTickHttpError(
      res,
      `[gotdx] history-tick failed: ${res.status} ${res.statusText}`,
    )
  }
  return parseHistoryTickPayload(await res.json())
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
  const raw = (await res.json()) as ReadonlyArray<Omit<SearchResult, 'market'>>
  // 搜索只负责列出结果；无法归一化的品种 market 置空，选中时由图表校验提示
  const normalized = raw.map((item) => {
    try {
      return { ...item, market: normalizeGotdxMarket(item) }
    } catch {
      return { ...item, market: '' }
    }
  })
  return normalized.map((item) => {
    const instrument = toGotdxInstrument(item)
    return {
      ...item,
      id: instrument.id,
      assetClass: instrument.assetClass,
      sessionId: instrument.sessionId,
      capabilities: instrument.capabilities,
    }
  })
}

/** 扩展市场 exchange → 统一 market；仅含已有 session 的映射 */
const GOTDX_EX_EXCHANGE_TO_MARKET: Readonly<Record<string, string>> = {
  CN: 'CN',
  FUND: 'CN',
  MONEY: 'CN',
  MONEY_FUND: 'CN',
  HK: 'HK',
  US: 'US',
}

function normalizeGotdxMarket(item: Omit<SearchResult, 'market'>): string {
  const sourceMarket = item.params?.market
  if (
    typeof sourceMarket === 'number' &&
    (sourceMarket === 0 || sourceMarket === 1 || sourceMarket === 2)
  ) {
    return 'CN'
  }

  if (typeof item.params?.category === 'number' && item.params.kind === 'ex') {
    const market = GOTDX_EX_EXCHANGE_TO_MARKET[item.exchange]
    if (market) return market
  }

  throw new KLineChartError(
    'FETCH_FAILED',
    `[gotdx] cannot normalize market for ${item.symbol}: exchange=${item.exchange} params=${JSON.stringify(item.params ?? {})}`,
  )
}

/** 将 GOTDX 搜索语义归一化为前端品种类别。 */
function resolveGotdxAssetClass(item: SearchResult): AssetClass {
  const kind = item.params?.kind
  if (kind === 'index') return 'index'
  if (kind === 'stock' || typeof item.params?.market === 'number') return 'stock'
  switch (item.exchange) {
    case 'CN':
    case 'HK':
    case 'US':
      return 'stock'
    case 'FUND':
    case 'MONEY':
    case 'MONEY_FUND':
      return 'fund'
    case 'FUTURES':
      return 'future'
    case 'FX':
      return 'forex'
    case 'INDEX':
      return 'index'
    case 'OPTION':
      return 'option'
    default:
      return 'unknown'
  }
}

/** 根据 GOTDX 原生路由键生成稳定品种 ID。 */
function createGotdxInstrumentId(item: SearchResult): string {
  const category = item.params?.category
  if (typeof category === 'number') return `gotdx:ex:${category}:${item.symbol}`
  const market = item.params?.market
  if (typeof market === 'number') {
    const kind = typeof item.params?.kind === 'string' ? item.params.kind : 'stock'
    return `gotdx:${kind}:${market}:${item.symbol}`
  }
  return `gotdx:unknown:${item.exchange}:${item.symbol}`
}

/** 计算 GOTDX 品种对前端公开的实际能力。 */
function resolveGotdxCapabilities(item: SearchResult): InstrumentCapabilities {
  if (!item.market) return {}
  const assetClass = resolveGotdxAssetClass(item)
  const adjustments =
    assetClass === 'stock' && item.params?.kind !== 'ex'
      ? (['qfq', 'hfq', 'none'] as const)
      : (['none'] as const)
  return {
    bars: { periods: GOTDX_KLINE_PERIODS, adjustments },
    timeShare: true,
  }
}

/** 将旧 GOTDX SearchResult 转换为统一品种描述。 */
function toGotdxInstrument(item: SearchResult): InstrumentDescriptor {
  const currency =
    item.market === 'CN'
      ? 'CNY'
      : item.market === 'HK'
        ? 'HKD'
        : item.market === 'US'
          ? 'USD'
          : undefined
  return {
    id: createGotdxInstrumentId(item),
    sourceId: 'gotdx',
    symbol: item.symbol,
    name: item.description,
    assetClass: resolveGotdxAssetClass(item),
    exchange: item.exchange,
    sessionId: item.market || undefined,
    currency,
    providerRef: item.params,
    capabilities: resolveGotdxCapabilities(item),
  }
}

/** 读取品种会话时区，缺失或未注册时拒绝请求。 */
function getInstrumentTimeZone(instrument: InstrumentDescriptor): string {
  if (!instrument.sessionId) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] sessionId is required for instrument ${instrument.id}`,
    )
  }
  return GOTDX_MARKET_SESSIONS.getRequired(instrument.sessionId).timeZone
}

/** 将 UTC 毫秒格式化为品种时区内的 YYYY-MM-DD。 */
function formatInstrumentDate(timestamp: number, timeZone: string): string {
  if (!Number.isFinite(timestamp)) {
    throw new KLineChartError('FETCH_FAILED', `[gotdx] invalid query timestamp: ${timestamp}`)
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** 校验请求品种属于 GOTDX 且声明了对应能力。 */
function assertGotdxCapability(
  instrument: InstrumentDescriptor,
  capability: 'bars' | 'timeShare',
): void {
  const supported =
    instrument.sourceId === 'gotdx' &&
    (capability === 'bars'
      ? instrument.capabilities.bars !== undefined
      : instrument.capabilities.timeShare === true)
  if (!supported) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[gotdx] instrument ${instrument.id} does not support ${capability}`,
    )
  }
}

/** 返回 GOTDX 已确认的成交量单位；未知市场保持缺失。 */
function resolveGotdxVolumeUnit(instrument: InstrumentDescriptor): VolumeUnit | undefined {
  return instrument.sessionId === 'CN' && instrument.assetClass !== 'index' ? 'lot' : undefined
}

type GotdxV1Envelope<T> = { data: T; requestId: string }

type GotdxV1Instrument = {
  id: string
  sourceId: string
  symbol: string
  name: string
  assetClass: AssetClass
  exchange: string
  sessionId?: string
  currency?: string
  providerRef?: Record<string, string | number | boolean>
  capabilities: InstrumentCapabilities
}

type GotdxV1BarResponse = {
  instrumentId: string
  period: KLinePeriod
  adjustment: string
  timezone: string
  volumeUnit?: VolumeUnit
  items: Array<Record<string, unknown>>
}

type GotdxV1TimeShareResponse = {
  instrumentId: string
  tradingDate: string
  timezone: string
  preClose: number | null
  volumeUnit?: VolumeUnit
  items: Array<Record<string, unknown>>
}

/** 请求 GOTDX V1 endpoint，并统一解析成功或错误 envelope。 */
async function fetchGotdxV1<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, init)
  const body = (await res.json().catch(() => undefined)) as
    GotdxV1Envelope<T> | { error?: { message?: unknown } } | undefined
  if (!res.ok) {
    const message =
      body && 'error' in body && typeof body.error?.message === 'string'
        ? body.error.message
        : `[gotdx] V1 request failed: ${res.status} ${res.statusText}`
    throw new KLineChartError('FETCH_FAILED', message)
  }
  if (!body || !('data' in body)) {
    throw new KLineChartError('FETCH_FAILED', '[gotdx] invalid V1 response envelope')
  }
  return body.data
}

/** 将 GOTDX V1 品种响应转换为前端领域模型。 */
function mapGotdxV1Instrument(item: GotdxV1Instrument): InstrumentDescriptor {
  return {
    id: item.id,
    sourceId: item.sourceId,
    symbol: item.symbol,
    name: item.name,
    assetClass: item.assetClass,
    exchange: item.exchange,
    sessionId: item.sessionId,
    currency: item.currency,
    providerRef: item.providerRef,
    capabilities: item.capabilities,
  }
}

/** 将 GOTDX V1 K 线响应映射为核心 KLineData。 */
function mapGotdxV1Bar(item: Record<string, unknown>, symbol: string): KLineData {
  return {
    timestamp: Number(item.timestamp),
    date: typeof item.date === 'string' ? item.date : undefined,
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: item.volume === undefined ? undefined : Number(item.volume),
    turnover: item.turnover === undefined ? undefined : Number(item.turnover),
    amplitude: item.amplitude === undefined ? undefined : Number(item.amplitude),
    changePercent: item.changePercent === undefined ? undefined : Number(item.changePercent),
    changeAmount: item.changeAmount === undefined ? undefined : Number(item.changeAmount),
    turnoverRate: item.turnoverRate === undefined ? undefined : Number(item.turnoverRate),
    symbol,
  }
}

/** 将 GOTDX V1 分时响应映射为核心 TimeShareData。 */
function mapGotdxV1TimeShare(item: Record<string, unknown>): TimeShareData {
  return {
    timestamp: Number(item.timestamp),
    price: Number(item.price),
    average: Number(item.average),
    volume: item.volume === undefined ? undefined : Number(item.volume),
    amount: item.amount === undefined ? undefined : Number(item.amount),
  }
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
  const kind = typeof config.params.kind === 'string' ? config.params.kind : undefined
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

/** 前端统一行情模型下的 GOTDX Provider，使用统一 V1 HTTP Transport。 */
export const gotdxMarketDataProvider: MarketDataProvider = {
  source: {
    id: 'gotdx',
    displayName: 'GOTDX',
    description: 'TDX data source via local proxy',
  },

  /** 通过轻量目录搜索探测 GOTDX 服务状态。 */
  async probe(signal) {
    const startedAt = Date.now()
    try {
      const result = await fetchGotdxV1<{
        status: 'online' | 'offline' | 'degraded'
        checkedAt: number
      }>('/api/v1/market-data/sources/gotdx/probe', { method: 'GET', signal })
      return {
        status: result.status,
        checkedAt: result.checkedAt,
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        status: 'offline',
        checkedAt: Date.now(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  },

  catalog: {
    /** 搜索并归一化 GOTDX 品种目录。 */
    async search(query) {
      const result = await fetchGotdxV1<{ items: Array<GotdxV1Instrument> }>(
        '/api/v1/market-data/instruments/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: 'gotdx',
            keyword: query.keyword,
            limit: query.limit,
            assetClasses: query.assetClasses,
          }),
          signal: query.signal,
        },
      )
      const instruments = result.items.map(mapGotdxV1Instrument)
      if (!query.assetClasses?.length) return instruments
      const allowed = new Set(query.assetClasses)
      return instruments.filter((instrument) => allowed.has(instrument.assetClass))
    },
  },

  bars: {
    /** 将标准 K 线查询发送到 GOTDX V1 bars 接口。 */
    async fetch(query) {
      assertGotdxCapability(query.instrument, 'bars')
      const timeZone = getInstrumentTimeZone(query.instrument)
      const result = await fetchGotdxV1<GotdxV1BarResponse>('/api/v1/market-data/bars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'gotdx',
          instrument: {
            id: query.instrument.id,
            symbol: query.instrument.symbol,
            exchange: query.instrument.exchange,
            providerRef: query.instrument.providerRef,
          },
          period: query.period,
          adjustment: query.adjustment,
          from: query.from,
          to: query.to,
        }),
      })
      return {
        instrumentId: query.instrument.id,
        period: query.period,
        adjustment: query.adjustment,
        timezone: result.timezone || timeZone,
        volumeUnit: result.volumeUnit ?? resolveGotdxVolumeUnit(query.instrument),
        data: result.items.map((item) => mapGotdxV1Bar(item, query.instrument.symbol)),
      }
    },
  },

  timeShare: {
    /** 将标准交易日分时查询发送到 GOTDX V1 timeshare 接口。 */
    async fetch(query) {
      assertGotdxCapability(query.instrument, 'timeShare')
      const timezone = getInstrumentTimeZone(query.instrument)
      const result = await fetchGotdxV1<GotdxV1TimeShareResponse>('/api/v1/market-data/timeshare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'gotdx',
          instrument: {
            id: query.instrument.id,
            symbol: query.instrument.symbol,
            exchange: query.instrument.exchange,
            providerRef: query.instrument.providerRef,
          },
          tradingDate: query.tradingDate,
        }),
      })
      return {
        instrumentId: query.instrument.id,
        tradingDate: query.tradingDate,
        timezone: result.timezone || timezone,
        preClose: result.preClose,
        volumeUnit: result.volumeUnit ?? resolveGotdxVolumeUnit(query.instrument),
        data: result.items.map(mapGotdxV1TimeShare),
      }
    },
  },
}

if (!marketDataProviderRegistry.get('gotdx')) {
  marketDataProviderRegistry.register(gotdxMarketDataProvider)
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
