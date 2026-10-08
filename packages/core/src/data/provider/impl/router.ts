/** 行情 Provider 能力流转层：按源级能力选择 Provider，并在确定性拒绝时切换数据源。 */

import { ERROR_CODES, GENERIC_ERROR_CODES, isKLineChartError, KLineChartError } from '@/errors.js'
import type {
  BarSeries,
  InstrumentDescriptor,
  MarketDataErrorCode,
  MarketDataProvider,
  RoutedMarketData,
  SourceCapabilityQuery,
  SourceRouteAttempt,
  SourceRouterBarsRequest,
  SourceRouterInstrumentIdentity,
  SourceRouterTimeShareRangeRequest,
  SourceRouterTimeShareRequest,
  TimeShareRange,
  TimeShareSeries,
} from '../types.js'
import { AUTO_SOURCE_ID, isFilterableAssetClass } from '../types.js'
import { MarketDataProviderRegistry, marketDataProviderRegistry } from './registry.js'

/** 所有候选源都明确拒绝请求时抛出的错误。 */
export class SourceRoutingError extends KLineChartError {
  readonly attempts: ReadonlyArray<SourceRouteAttempt>

  /** 创建包含完整流转链的统一错误。 */
  constructor(attempts: ReadonlyArray<SourceRouteAttempt>) {
    super(
      ERROR_CODES.FETCH_FAILED,
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
  return new KLineChartError(ERROR_CODES.FETCH_FAILED, `[${sourceId}] ${String(error)}`, {
    cause: error,
  })
}

/** 读取 Provider 错误码，未知异常统一视为不可流转故障。 */
function errorCode(error: unknown): MarketDataErrorCode {
  if (!isKLineChartError(error)) return 'UNKNOWN'
  if (
    error.code === ERROR_CODES.UNSUPPORTED_CAPABILITY ||
    error.code === ERROR_CODES.INSTRUMENT_NOT_FOUND ||
    error.code === ERROR_CODES.FETCH_ABORTED
  ) {
    return error.code === ERROR_CODES.FETCH_ABORTED ? 'ABORTED' : error.code
  }
  if (error.code === ERROR_CODES.FETCH_FAILED) return 'UPSTREAM_UNAVAILABLE'
  return 'UNKNOWN'
}

/** 判断错误是否允许请求流转到下一个 Provider。 */
function isRoutableRejection(code: MarketDataErrorCode): boolean {
  return code === ERROR_CODES.UNSUPPORTED_CAPABILITY || code === ERROR_CODES.INSTRUMENT_NOT_FOUND
}

/** 从候选目录中解析目标源自己的品种描述。 */
async function resolveInstrument(
  provider: MarketDataProvider,
  identity: SourceRouterInstrumentIdentity,
  attached: InstrumentDescriptor | undefined,
  capability: 'bars' | 'timeShare' | 'timeShareRange',
  signal?: AbortSignal,
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
        : capability === 'timeShare'
          ? attached.capabilities.timeShare === true
          : attached.capabilities.timeShareRange !== undefined
    if (!supported) {
      throw new KLineChartError(
        ERROR_CODES.UNSUPPORTED_CAPABILITY,
        `[${provider.source.id}] instrument "${attached.id}" does not support ${capability}`,
      )
    }
    // 足迹需要完整的品种价格精度。布局恢复或旧目录条目缺少精度时，从权威目录重新解析。
    if (
      !attached.capabilities.trades?.raw ||
      (typeof attached.tickSize === 'number' &&
        Number.isFinite(attached.tickSize) &&
        attached.tickSize > 0)
    )
      return attached
  }

  if (!provider.catalog) {
    throw new KLineChartError(
      ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `[${provider.source.id}] cannot resolve instrument "${identity.symbol}"`,
    )
  }

  const candidates = await provider.catalog.search({
    keyword: identity.symbol,
    limit: 20,
    // unknown 不参与筛选：传 unknown 会误杀已归一化到已知类别的同代码品种。
    assetClasses: isFilterableAssetClass(identity.assetClass) ? [identity.assetClass] : undefined,
    signal,
  })
  const instrument = candidates.find(
    (candidate) =>
      candidate.sourceId === provider.source.id &&
      candidate.symbol === identity.symbol &&
      (identity.exchange === undefined || candidate.exchange === identity.exchange),
  )
  if (!instrument) {
    throw new KLineChartError(
      ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `[${provider.source.id}] instrument "${identity.symbol}" was not found`,
    )
  }

  const supported =
    capability === 'bars'
      ? instrument.capabilities.bars !== undefined
      : capability === 'timeShare'
        ? instrument.capabilities.timeShare === true
        : instrument.capabilities.timeShareRange !== undefined
  if (!supported) {
    throw new KLineChartError(
      ERROR_CODES.UNSUPPORTED_CAPABILITY,
      `[${provider.source.id}] instrument "${instrument.id}" does not support ${capability}`,
    )
  }
  return instrument
}

/** 维护可声明能力未知的数据源的探测快照。 */
async function discoverCapabilities(
  registry: MarketDataProviderRegistry,
  provider: MarketDataProvider,
  signal?: AbortSignal,
): Promise<void> {
  if (registry.getCapabilities(provider.source.id) !== undefined) return
  const result = await provider.probe(signal)
  if (result.capabilities !== undefined) {
    registry.setCapabilities(provider.source.id, result.capabilities)
  }
}

/** 行情 Provider Router。 */
export class SourceRouter {
  constructor(private readonly registry: MarketDataProviderRegistry = marketDataProviderRegistry) {}

  /** 获取请求候选源；显式来源只返回自身，auto 才允许按优先级流转。 */
  private async getCandidates(
    query: SourceCapabilityQuery,
    preferredSourceId: string | undefined,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<MarketDataProvider>> {
    const enabled = this.registry.getEnabledByPriority()
    const explicitSource =
      preferredSourceId !== undefined && preferredSourceId !== AUTO_SOURCE_ID
        ? preferredSourceId
        : undefined
    if (explicitSource) {
      const provider = enabled.find((candidate) => candidate.source.id === explicitSource)
      if (!provider) return []
      if (this.registry.getCapabilities(provider.source.id) === undefined) {
        await discoverCapabilities(this.registry, provider, signal)
      }
      return this.registry.getEnabledByCapability(query).includes(provider) ? [provider] : []
    }

    await Promise.all(
      enabled
        .filter((provider) => this.registry.getCapabilities(provider.source.id) === undefined)
        .map((provider) =>
          discoverCapabilities(this.registry, provider, signal).catch(() => undefined),
        ),
    )
    const filtered = this.registry.getEnabledByCapability(query)
    return filtered
  }

  /** 执行通用流转循环，只对确定性拒绝尝试下一个源。 */
  private async route<T>(
    query: SourceCapabilityQuery,
    identity: SourceRouterInstrumentIdentity,
    preferredSourceId: string | undefined,
    attached: InstrumentDescriptor | undefined,
    capability: 'bars' | 'timeShare' | 'timeShareRange',
    signal: AbortSignal | undefined,
    fetch: (provider: MarketDataProvider, instrument: InstrumentDescriptor) => Promise<T>,
  ): Promise<RoutedMarketData<T>> {
    const attempts: SourceRouteAttempt[] = []
    signal?.throwIfAborted()
    const candidates = await this.getCandidates(query, preferredSourceId, signal)
    for (const provider of candidates) {
      try {
        signal?.throwIfAborted()
        const instrument = await resolveInstrument(provider, identity, attached, capability, signal)
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
      },
      request,
      request.preferredSourceId,
      request.instrument,
      'bars',
      request.signal,
      async (provider, instrument) => {
        if (!provider.bars) {
          throw new KLineChartError(
            ERROR_CODES.UNSUPPORTED_CAPABILITY,
            `[${provider.source.id}] has no bars source`,
          )
        }
        const capability = instrument.capabilities.bars
        if (
          !capability?.periods.includes(request.period) ||
          !capability.adjustments.includes(request.adjustment)
        ) {
          throw new KLineChartError(
            ERROR_CODES.UNSUPPORTED_CAPABILITY,
            `[${provider.source.id}] instrument "${instrument.id}" does not support ${request.period}/${request.adjustment}`,
          )
        }
        return provider.bars.fetch({
          instrument,
          period: request.period,
          adjustment: request.adjustment,
          barAggregation: request.barAggregation,
          limit: request.limit,
          beforeTimestamp: request.beforeTimestamp,
          signal: request.signal,
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
      request.signal,
      async (provider, instrument) => {
        if (!provider.timeShare) {
          throw new KLineChartError(
            ERROR_CODES.UNSUPPORTED_CAPABILITY,
            `[${provider.source.id}] has no timeShare source`,
          )
        }
        const tradingDate = request.tradingDate ?? request.resolveTradingDate?.(instrument)
        if (!tradingDate) {
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_PARAM,
            `[${provider.source.id}] tradingDate is required for timeShare`,
          )
        }
        return provider.timeShare.fetch({ instrument, tradingDate, signal: request.signal })
      },
    )
  }

  /** 请求多日分时并在确定性源拒绝时自动流转。 */
  async timeShareRange(
    request: SourceRouterTimeShareRangeRequest,
  ): Promise<RoutedMarketData<TimeShareRange>> {
    return this.route(
      { capability: 'timeShareRange', assetClass: request.assetClass, days: request.days },
      request,
      request.preferredSourceId,
      request.instrument,
      'timeShareRange',
      request.signal,
      async (provider, instrument) => {
        if (!provider.timeShareRange) {
          throw new KLineChartError(
            ERROR_CODES.UNSUPPORTED_CAPABILITY,
            `[${provider.source.id}] has no timeShareRange source`,
          )
        }
        const endTradingDate = request.endTradingDate ?? request.resolveEndTradingDate?.(instrument)
        if (!endTradingDate) {
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_PARAM,
            `[${provider.source.id}] endTradingDate is required for timeShareRange`,
          )
        }
        return provider.timeShareRange.fetch({
          instrument,
          endTradingDate,
          days: request.days,
          signal: request.signal,
        })
      },
    )
  }
}

/** 内置 Provider Router。 */
export const sourceRouter = new SourceRouter()
