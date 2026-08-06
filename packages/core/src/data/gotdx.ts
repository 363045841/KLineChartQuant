/** GOTDX V1 Provider：负责统一协议 Transport、响应校验和领域模型映射。 */
import type { KLineData, TimeShareData } from '../controllers/types'
import { KLineChartError } from '../errors'
import { MarketSessionRegistry } from '../engine/market/marketSessionRegistry'

import { marketDataProviderRegistry } from './marketData/providerRegistry'
import type {
  AssetClass,
  InstrumentCapabilities,
  InstrumentDescriptor,
  KLinePeriod,
  MarketDataProvider,
  VolumeUnit,
} from './marketData/types'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'
const GOTDX_MARKET_SESSIONS = new MarketSessionRegistry()

/** GOTDX V1 成功 envelope。 */
type GotdxV1Envelope<T> = { data: T; requestId: string }

/** GOTDX V1 品种响应。 */
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

/** GOTDX V1 K 线响应。 */
type GotdxV1BarResponse = {
  instrumentId: string
  period: KLinePeriod
  adjustment: string
  timezone: string
  volumeUnit?: VolumeUnit
  items: Array<Record<string, unknown>>
}

/** GOTDX V1 分时响应。 */
type GotdxV1TimeShareResponse = {
  instrumentId: string
  tradingDate: string
  timezone: string
  preClose: number | null
  volumeUnit?: VolumeUnit
  items: Array<Record<string, unknown>>
}

/** 读取 Provider 运行时地址。 */
function getBaseUrl(): string {
  return marketDataProviderRegistry.getConfig('gotdx').baseUrl ?? DEFAULT_BASE_URL
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

/** 返回 GOTDX 已确认的成交量单位；未知市场保持缺失。 */
function resolveGotdxVolumeUnit(instrument: InstrumentDescriptor): VolumeUnit | undefined {
  return instrument.sessionId === 'CN' && instrument.assetClass !== 'index' ? 'lot' : undefined
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

/** GOTDX V1 Provider。 */
export const gotdxMarketDataProvider: MarketDataProvider = {
  source: {
    id: 'gotdx',
    displayName: 'GOTDX',
    description: 'TDX data source via V1 local proxy',
    defaultBaseUrl: DEFAULT_BASE_URL,
  },

  /** 通过 V1 probe endpoint 探测 GOTDX 服务状态。 */
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
    /** 通过 V1 instruments/search 搜索并归一化 GOTDX 品种目录。 */
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
    /** 通过 V1 bars endpoint 拉取标准 K 线。 */
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
        signal: query.signal,
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
    /** 通过 V1 timeshare endpoint 拉取标准分时。 */
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
        signal: query.signal,
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
