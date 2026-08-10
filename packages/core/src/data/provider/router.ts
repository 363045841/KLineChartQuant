/** 行情 Provider 能力流转层：按源级能力选择 Provider，并在确定性拒绝时切换数据源。 */

import { isKLineChartError, KLineChartError } from '../../errors'

import {
  marketDataProviderRegistry,
  MarketDataProviderRegistry,
  type SourceCapabilityQuery,
} from './registry'
import type {
  AssetClass,
  BarSeries,
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  MarketDataErrorCode,
  MarketDataProvider,
  TimeShareSeries,
  TradingDate,
} from './types'

/** Router 识别的统一品种身份，不包含任何 Provider 私有路由字段。 */
export interface SourceRouterInstrumentIdentity {
  symbol: string
  exchange?: string
  assetClass?: AssetClass
}

/** K 线流转请求。 */
export interface SourceRouterBarsRequest extends SourceRouterInstrumentIdentity {
  preferredSourceId?: string
  instrument?: InstrumentDescriptor
  period: KLinePeriod
  adjustment: KLineAdjustment
  from: number
  to: number
}

/** 分时流转请求。 */
export interface SourceRouterTimeShareRequest extends SourceRouterInstrumentIdentity {
  preferredSourceId?: string
  instrument?: InstrumentDescriptor
  tradingDate?: TradingDate
  resolveTradingDate?: (instrument: InstrumentDescriptor) => TradingDate
}

/** 单次源尝试的结果，用于链耗尽后的诊断。 */
export interface SourceRouteAttempt {
  sourceId: string
  code: MarketDataErrorCode
  message: string
}

/** 成功请求的实际 Provider 与目标源品种。 */
export interface RoutedMarketData<T> {
  series: T
  provider: MarketDataProvider
  instrument: InstrumentDescriptor
  attempts: ReadonlyArray<SourceRouteAttempt>
}

/** 所有候选源都明确拒绝请求时抛出的错误。 */
export class SourceRoutingError extends KLineChartError {
  readonly attempts: ReadonlyArray<SourceRouteAttempt>

  /** 创建包含完整流转链的统一错误。 */
  constructor(attempts: ReadonlyArray<SourceRouteAttempt>) {
    super(
      'FETCH_FAILED',
      attempts.length === 0
        ? '[SourceRouter] no enabled Provider supports the requested capability'
        : `[SourceRouter] all candidate Providers rejected the request: ${attempts
            .map((attempt) => `${attempt.sourceId}:${attempt.code}`)
            .join(' -> ')}`,
    )
    this.attempts = attempts
  }
}

/** 将未知异常转换为 Router 可分类的错误。 */
function asProviderError(error: unknown, sourceId: string): KLineChartError {
  if (isKLineChartError(error)) return error
  return new KLineChartError('FETCH_FAILED', `[${sourceId}] ${String(error)}`, { cause: error })
}

/** 读取 Provider 错误码，未知异常统一视为不可流转故障。 */
function errorCode(error: unknown): MarketDataErrorCode {
  if (!isKLineChartError(error)) return 'UNKNOWN'
  if (
    error.code === 'UNSUPPORTED_CAPABILITY' ||
    error.code === 'INSTRUMENT_NOT_FOUND' ||
    error.code === 'FETCH_ABORTED'
  ) {
    return error.code === 'FETCH_ABORTED' ? 'ABORTED' : error.code
  }
  if (error.code === 'FETCH_FAILED') return 'UPSTREAM_UNAVAILABLE'
  return 'UNKNOWN'
}

/** 判断错误是否允许请求流转到下一个 Provider。 */
function isRoutableRejection(code: MarketDataErrorCode): boolean {
  return code === 'UNSUPPORTED_CAPABILITY' || code === 'INSTRUMENT_NOT_FOUND'
}

/** 从候选目录中解析目标源自己的品种描述。 */
async function resolveInstrument(
  provider: MarketDataProvider,
  identity: SourceRouterInstrumentIdentity,
  attached: InstrumentDescriptor | undefined,
  capability: 'bars' | 'timeShare',
): Promise<InstrumentDescriptor> {
  if (
    attached?.sourceId === provider.source.id &&
    attached.symbol === identity.symbol &&
    (identity.exchange === undefined || attached.exchange === identity.exchange) &&
    (identity.assetClass === undefined || attached.assetClass === identity.assetClass)
  ) {
    const supported =
      capability === 'bars'
        ? attached.capabilities.bars !== undefined
        : attached.capabilities.timeShare === true
    if (!supported) {
      throw new KLineChartError(
        'UNSUPPORTED_CAPABILITY',
        `[${provider.source.id}] instrument "${attached.id}" does not support ${capability}`,
      )
    }
    return attached
  }

  if (!provider.catalog) {
    throw new KLineChartError(
      'INSTRUMENT_NOT_FOUND',
      `[${provider.source.id}] cannot resolve instrument "${identity.symbol}"`,
    )
  }

  const candidates = await provider.catalog.search({
    keyword: identity.symbol,
    limit: 20,
    assetClasses: identity.assetClass ? [identity.assetClass] : undefined,
  })
  const instrument = candidates.find(
    (candidate) =>
      candidate.sourceId === provider.source.id &&
      candidate.symbol === identity.symbol &&
      (identity.exchange === undefined || candidate.exchange === identity.exchange),
  )
  if (!instrument) {
    throw new KLineChartError(
      'INSTRUMENT_NOT_FOUND',
      `[${provider.source.id}] instrument "${identity.symbol}" was not found`,
    )
  }

  const supported =
    capability === 'bars'
      ? instrument.capabilities.bars !== undefined
      : instrument.capabilities.timeShare === true
  if (!supported) {
    throw new KLineChartError(
      'UNSUPPORTED_CAPABILITY',
      `[${provider.source.id}] instrument "${instrument.id}" does not support ${capability}`,
    )
  }
  return instrument
}

/** 维护可声明能力未知的数据源的探测快照。 */
async function discoverCapabilities(
  registry: MarketDataProviderRegistry,
  provider: MarketDataProvider,
): Promise<void> {
  if (registry.getCapabilities(provider.source.id) !== undefined) return
  const result = await provider.probe()
  if (result.capabilities !== undefined) {
    registry.setCapabilities(provider.source.id, result.capabilities)
  }
}

/** 行情 Provider Router。 */
export class SourceRouter {
  constructor(private readonly registry: MarketDataProviderRegistry = marketDataProviderRegistry) {}

  /** 获取已启用且声明支持请求能力的候选源，首选源始终排在最前。 */
  private async getCandidates(
    query: SourceCapabilityQuery,
    preferredSourceId: string | undefined,
  ): Promise<ReadonlyArray<MarketDataProvider>> {
    const enabled = this.registry.getEnabledByPriority()
    const preferred = enabled.find((provider) => provider.source.id === preferredSourceId)
    const others = enabled.filter((provider) => provider !== preferred)
    await Promise.all(
      others
        .filter((provider) => this.registry.getCapabilities(provider.source.id) === undefined)
        .map((provider) => discoverCapabilities(this.registry, provider).catch(() => undefined)),
    )
    const filtered = this.registry.getEnabledByCapability(query)
    return preferred
      ? [preferred, ...filtered.filter((provider) => provider !== preferred)]
      : filtered
  }

  /** 执行通用流转循环，只对确定性拒绝尝试下一个源。 */
  private async route<T>(
    query: SourceCapabilityQuery,
    identity: SourceRouterInstrumentIdentity,
    preferredSourceId: string | undefined,
    attached: InstrumentDescriptor | undefined,
    capability: 'bars' | 'timeShare',
    fetch: (provider: MarketDataProvider, instrument: InstrumentDescriptor) => Promise<T>,
  ): Promise<RoutedMarketData<T>> {
    const attempts: SourceRouteAttempt[] = []
    const candidates = await this.getCandidates(query, preferredSourceId)
    for (const provider of candidates) {
      try {
        const instrument = await resolveInstrument(provider, identity, attached, capability)
        const series = await fetch(provider, instrument)
        return { series, provider, instrument, attempts: [...attempts] }
      } catch (error) {
        const normalized = asProviderError(error, provider.source.id)
        const code = errorCode(normalized)
        attempts.push({ sourceId: provider.source.id, code, message: normalized.message })
        if (!isRoutableRejection(code)) throw normalized
      }
    }
    throw new SourceRoutingError(attempts)
  }

  /** 请求 K 线并在确定性源拒绝时自动流转。 */
  async bars(request: SourceRouterBarsRequest): Promise<RoutedMarketData<BarSeries>> {
    return this.route(
      {
        capability: 'bars',
        assetClass: request.assetClass,
        period: request.period,
        adjustment: request.adjustment,
        from: request.from,
        to: request.to,
      },
      request,
      request.preferredSourceId,
      request.instrument,
      'bars',
      async (provider, instrument) => {
        if (!provider.bars) {
          throw new KLineChartError(
            'UNSUPPORTED_CAPABILITY',
            `[${provider.source.id}] has no bars source`,
          )
        }
        const capability = instrument.capabilities.bars
        if (
          !capability?.periods.includes(request.period) ||
          !capability.adjustments.includes(request.adjustment)
        ) {
          throw new KLineChartError(
            'UNSUPPORTED_CAPABILITY',
            `[${provider.source.id}] instrument "${instrument.id}" does not support ${request.period}/${request.adjustment}`,
          )
        }
        return provider.bars.fetch({
          instrument,
          period: request.period,
          adjustment: request.adjustment,
          from: request.from,
          to: request.to,
        })
      },
    )
  }

  /** 请求分时并在确定性源拒绝时自动流转。 */
  async timeShare(
    request: SourceRouterTimeShareRequest,
  ): Promise<RoutedMarketData<TimeShareSeries>> {
    return this.route(
      { capability: 'timeShare', assetClass: request.assetClass },
      request,
      request.preferredSourceId,
      request.instrument,
      'timeShare',
      async (provider, instrument) => {
        if (!provider.timeShare) {
          throw new KLineChartError(
            'UNSUPPORTED_CAPABILITY',
            `[${provider.source.id}] has no timeShare source`,
          )
        }
        const tradingDate = request.tradingDate ?? request.resolveTradingDate?.(instrument)
        if (!tradingDate) {
          throw new KLineChartError(
            'INVALID_PARAM',
            `[${provider.source.id}] tradingDate is required for timeShare`,
          )
        }
        return provider.timeShare.fetch({ instrument, tradingDate })
      },
    )
  }
}

/** 内置 Provider Router。 */
export const sourceRouter = new SourceRouter()
