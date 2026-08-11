/**
 * MarketDataProvider 到旧 Fetcher API 的迁移适配器。
 * 适配器只转换契约，不从代码、交易所或 providerRef 猜测品种语义。
 */

import { KLineChartError } from '../../errors'
import { MarketSessionRegistry } from '../../engine/market/marketSessionRegistry'

import type {
  DataFetcherFn,
  FetchConfig,
  SearchFetcherFn,
  TimeShareFetchConfig,
  TimeShareFetcherFn,
} from '../legacy/types'
import type {
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  MarketDataProvider,
  TradingDate,
} from './types'

const KLINE_PERIODS = new Set<KLinePeriod>([
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
])

const KLINE_ADJUSTMENTS = new Set<KLineAdjustment>(['qfq', 'hfq', 'splits', 'none'])
const DEFAULT_SEARCH_LIMIT = 20

/** 旧 Fetcher 请求中可用于查找标准品种的信息。 */
export type LegacyInstrumentResolveRequest =
  | {
      capability: 'bars'
      sourceId: string
      config: FetchConfig
    }
  | {
      capability: 'timeShare'
      sourceId: string
      config: TimeShareFetchConfig
    }

/** 将旧请求解析为此前由目录返回的标准品种。 */
export type LegacyInstrumentResolver = (
  request: LegacyInstrumentResolveRequest,
) => InstrumentDescriptor | Promise<InstrumentDescriptor>

/** Legacy Adapter 创建选项。 */
export interface LegacyMarketDataAdapterOptions {
  resolveInstrument: LegacyInstrumentResolver
  /** 自定义市场时段注册表；默认包含 CN、HK、US 及 Provider 声明的时段。 */
  marketSessions?: MarketSessionRegistry
}

/** 与 Provider 实际能力对应的一组旧 Fetcher。 */
export interface LegacyMarketDataAdapters {
  fetcher?: DataFetcherFn
  searcher?: SearchFetcherFn
  timeShareFetcher?: TimeShareFetcherFn
}

/** 校验旧路由传入的 source ID 与当前 Provider 一致。 */
function assertSource(provider: MarketDataProvider, sourceId: string): void {
  if (sourceId !== provider.source.id) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] expected source "${provider.source.id}", received "${sourceId}"`,
    )
  }
}

/** 校验 resolver 没有返回其他数据源或其他代码的品种。 */
function assertResolvedInstrument(
  provider: MarketDataProvider,
  requestedSymbol: string,
  instrument: InstrumentDescriptor,
): void {
  if (instrument.sourceId !== provider.source.id || instrument.symbol !== requestedSymbol) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] resolver returned mismatched instrument "${instrument.id}"`,
    )
  }
}

/** 将旧字符串周期收窄为统一 K 线周期。 */
function parsePeriod(period: string): KLinePeriod {
  if (!KLINE_PERIODS.has(period as KLinePeriod)) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] unsupported K-line period "${period}"`,
    )
  }
  return period as KLinePeriod
}

/** 将旧字符串复权方式收窄为统一复权枚举。 */
function parseAdjustment(adjustment: string): KLineAdjustment {
  if (!KLINE_ADJUSTMENTS.has(adjustment as KLineAdjustment)) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] unsupported adjustment "${adjustment}"`,
    )
  }
  return adjustment as KLineAdjustment
}

/** 将旧日期字符串转换为 UTC 毫秒时间戳。 */
function parseDate(value: string, field: string): number {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] invalid ${field} "${value}"`,
    )
  }
  return timestamp
}

/** 校验并格式化旧 YYYYMMDD 数字交易日。 */
function parseNumericTradingDate(value: number): TradingDate {
  if (!Number.isInteger(value)) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] invalid trading date "${value}"`,
    )
  }
  const raw = String(value)
  if (!/^\d{8}$/.test(raw)) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] invalid trading date "${value}"`,
    )
  }
  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] invalid trading date "${value}"`,
    )
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` as TradingDate
}

/** 按品种交易时区计算当前 YYYY-MM-DD 交易日。 */
function currentTradingDate(
  instrument: InstrumentDescriptor,
  marketSessions: MarketSessionRegistry,
): TradingDate {
  if (!instrument.sessionId) {
    throw new KLineChartError(
      'FETCH_FAILED',
      `[MarketDataLegacyAdapter] sessionId is required for timeshare instrument "${instrument.id}"`,
    )
  }
  const timeZone = marketSessions.getRequired(instrument.sessionId).timeZone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}` as TradingDate
}

/** 创建 Provider 到旧 Fetcher API 的一次性迁移适配器。 */
export function createLegacyMarketDataAdapters(
  provider: MarketDataProvider,
  options: LegacyMarketDataAdapterOptions,
): LegacyMarketDataAdapters {
  const marketSessions =
    options.marketSessions ?? new MarketSessionRegistry(provider.source.marketSessions)

  /** 将旧 K 线请求交给 Provider bars 模块。 */
  const fetcher: DataFetcherFn | undefined = provider.bars
    ? async (sourceId, config) => {
        assertSource(provider, sourceId)
        const instrument = await options.resolveInstrument({
          capability: 'bars',
          sourceId,
          config,
        })
        assertResolvedInstrument(provider, config.symbol, instrument)
        const from = parseDate(config.startDate, 'startDate')
        const to = parseDate(config.endDate, 'endDate')
        if (from > to) {
          throw new KLineChartError(
            'FETCH_FAILED',
            '[MarketDataLegacyAdapter] startDate must not be after endDate',
          )
        }
        const series = await provider.bars!.fetch({
          instrument,
          period: parsePeriod(config.period),
          adjustment: parseAdjustment(config.adjust),
          limit: 500,
          before: to + 24 * 60 * 60 * 1000,
        })
        return series.data.filter((item) => item.timestamp >= from && item.timestamp <= to)
      }
    : undefined

  /** 将 Provider 目录结果降级为旧搜索结果。 */
  const searcher: SearchFetcherFn | undefined = provider.catalog
    ? async (sourceId, config) => {
        assertSource(provider, sourceId)
        const instruments = await provider.catalog!.search({
          keyword: config.query,
          limit: config.limit ?? DEFAULT_SEARCH_LIMIT,
          signal: config.signal,
        })
        return instruments.map((instrument) => ({
          id: instrument.id,
          assetClass: instrument.assetClass,
          sessionId: instrument.sessionId,
          capabilities: instrument.capabilities,
          symbol: instrument.symbol,
          description: instrument.name,
          exchange: instrument.exchange,
          market: instrument.sessionId ?? '',
          source: instrument.sourceId,
          params: instrument.providerRef,
        }))
      }
    : undefined

  /** 将旧分时请求交给 Provider timeShare 模块。 */
  const timeShareFetcher: TimeShareFetcherFn | undefined = provider.timeShare
    ? async (sourceId, config) => {
        assertSource(provider, sourceId)
        const instrument = await options.resolveInstrument({
          capability: 'timeShare',
          sourceId,
          config,
        })
        assertResolvedInstrument(provider, config.symbol, instrument)
        const tradingDate =
          config.date === undefined
            ? currentTradingDate(instrument, marketSessions)
            : parseNumericTradingDate(config.date)
        const series = await provider.timeShare!.fetch({ instrument, tradingDate })
        return { data: series.data, preClose: series.preClose }
      }
    : undefined

  return { fetcher, searcher, timeShareFetcher }
}
