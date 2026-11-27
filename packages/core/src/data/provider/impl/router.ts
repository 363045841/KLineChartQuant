/** 行情 Provider 能力流转层：按源级能力选择 Provider，并在确定性拒绝时切换数据源。 */

import {
  ERROR_CODES,
  GENERIC_ERROR_CODES,
  isKLineChartError,
  KLineChartError,
  type ErrorDetails,
  type KLineChartErrorCode,
} from '@/errors.js'
import type {
  BarSeries,
  InstrumentCapabilities,
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
import { AUTO_SOURCE, isFilterableInstrumentType } from '../types.js'
import { INSTRUMENT_LOOKUP_CANDIDATE_LIMIT, pickExactInstrument } from '../instrumentSearch.js'
import type { MarketDataProviderRegistry } from '../registry.js'

/** 所有候选源都明确拒绝请求时抛出的错误。 */
export class SourceRoutingError extends KLineChartError {
  readonly attempts: ReadonlyArray<SourceRouteAttempt>

  /**
   * 创建包含完整流转链的统一错误。
   *
   * 错误码由流转链推导：所有源都"没有这个品种"就报 INSTRUMENT_NOT_FOUND，
   * 都"不支持该能力"就报 UNSUPPORTED_CAPABILITY，只有真实取数失败才是 FETCH_FAILED。
   * 这样模型拿到的是可纠正的事实，而不是"检查网络"。
   */
  constructor(attempts: ReadonlyArray<SourceRouteAttempt>, label: string, details: ErrorDetails) {
    super(
      routeErrorCode(attempts),
      attempts.length === 0
        ? `No enabled source can serve ${label}.`
        : `${label} was rejected by every candidate source: ${attempts
            .map((attempt) => `${attempt.source}:${attempt.code}`)
            .join(' -> ')}`,
      { details: { ...details, attempts: serializeAttempts(attempts) } },
    )
    this.attempts = attempts
  }
}

/** 流转链转为可序列化的错误细节。 */
function serializeAttempts(
  attempts: ReadonlyArray<SourceRouteAttempt>,
): Array<{ source: string; code: string; message: string }> {
  return attempts.map((attempt) => ({
    source: attempt.source,
    code: attempt.code,
    message: attempt.message,
  }))
}

/** 由流转链推导对外错误码；混合原因才归为取数失败。 */
function routeErrorCode(attempts: ReadonlyArray<SourceRouteAttempt>): KLineChartErrorCode {
  if (attempts.length === 0) return ERROR_CODES.UNSUPPORTED_CAPABILITY
  if (attempts.every((attempt) => attempt.code === ERROR_CODES.INSTRUMENT_NOT_FOUND)) {
    return ERROR_CODES.INSTRUMENT_NOT_FOUND
  }
  if (attempts.every((attempt) => attempt.code === ERROR_CODES.UNSUPPORTED_CAPABILITY)) {
    return ERROR_CODES.UNSUPPORTED_CAPABILITY
  }
  return ERROR_CODES.FETCH_FAILED
}

/** 将未知异常转换为 Router 可分类的错误。 */
function asProviderError(error: unknown, source: string): KLineChartError {
  if (isKLineChartError(error)) return error
  return new KLineChartError(ERROR_CODES.FETCH_FAILED, `[${source}] ${String(error)}`, {
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

/** Router 单次请求可流转的行情能力。 */
type RoutableCapability = 'bars' | 'timeShare' | 'timeShareRange'

/** 判断单个品种的能力声明是否覆盖指定请求能力。 */
function instrumentSupportsCapability(
  capabilities: InstrumentCapabilities,
  capability: RoutableCapability,
): boolean {
  if (capability === 'bars') return capabilities.bars !== undefined
  if (capability === 'timeShare') return capabilities.timeShare === true
  return capabilities.timeShareRange !== undefined
}

/** 判断 tickSize 是否为可用于价格精度计算的有效值。 */
function isValidTickSize(tickSize: number | undefined): boolean {
  return typeof tickSize === 'number' && Number.isFinite(tickSize) && tickSize > 0
}

/**
 * 判断品种描述是否具备其声明能力所需的全部必要字段。
 * 声明了依赖价格精度的逐笔成交能力时，必须带有效 tickSize；
 * 描述不完整意味着可能来自过期或残缺的目录快照，不能直接沿用。
 */
function isInstrumentDescriptorComplete(instrument: InstrumentDescriptor): boolean {
  if (instrument.capabilities.trades?.raw) return isValidTickSize(instrument.tickSize)
  return true
}

/** 从候选目录中解析目标源自己的品种描述。 */
async function resolveInstrument(
  provider: MarketDataProvider,
  identity: SourceRouterInstrumentIdentity,
  attached: InstrumentDescriptor | undefined,
  capability: RoutableCapability,
  signal?: AbortSignal,
): Promise<InstrumentDescriptor> {
  if (
    attached?.source === provider.source.id &&
    attached.symbol === identity.symbol &&
    (identity.exchange === undefined || attached.exchange === identity.exchange) &&
    (identity.instrumentType === undefined || attached.instrumentType === identity.instrumentType)
  ) {
    if (!instrumentSupportsCapability(attached.capabilities, capability)) {
      throw new KLineChartError(
        ERROR_CODES.UNSUPPORTED_CAPABILITY,
        `[${provider.source.id}] instrument "${attached.id}" does not support ${capability}`,
      )
    }
    // 描述缺少被声明能力所需的必要字段时，回权威目录重新解析以获得完整字段。
    if (isInstrumentDescriptorComplete(attached)) return attached
  }

  if (!provider.catalog) {
    throw new KLineChartError(
      ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `[${provider.source.id}] cannot resolve instrument "${identity.symbol}"`,
    )
  }

  const candidates = await provider.catalog.search({
    keyword: identity.symbol,
    limit: INSTRUMENT_LOOKUP_CANDIDATE_LIMIT,
    // unknown 不参与筛选：传 unknown 会误杀已归一化到已知类别的同代码品种。
    instrumentTypes: isFilterableInstrumentType(identity.instrumentType)
      ? [identity.instrumentType]
      : undefined,
    signal,
  })
  // 精确匹配规则只由 instrumentSearch 定义，路由层不维护第二套代码比较。
  const instrument = pickExactInstrument(candidates, identity, provider.source.id)
  if (!instrument) {
    throw new KLineChartError(
      ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `[${provider.source.id}] instrument "${identity.symbol}" was not found`,
    )
  }

  if (!instrumentSupportsCapability(instrument.capabilities, capability)) {
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
  constructor(private readonly registry: MarketDataProviderRegistry) {}

  /** 获取请求候选源；显式来源只返回自身，auto 才允许按优先级流转。 */
  private async getCandidates(
    query: SourceCapabilityQuery,
    preferredSource: string | undefined,
    signal?: AbortSignal,
    attempts?: SourceRouteAttempt[],
  ): Promise<ReadonlyArray<MarketDataProvider>> {
    const enabled = this.registry.getEnabledByPriority()
    const explicitSource =
      preferredSource !== undefined && preferredSource !== AUTO_SOURCE
        ? preferredSource
        : undefined
    if (explicitSource) {
      const provider = enabled.find((candidate) => candidate.source.id === explicitSource)
      if (!provider) return []
      if (this.registry.getCapabilities(provider.source.id) === undefined) {
        await discoverCapabilities(this.registry, provider, signal)
      }
      return this.registry.getEnabledByCapability(query).includes(provider) ? [provider] : []
    }

    const probes = enabled.filter((provider) => this.registry.getCapabilities(provider.source.id) === undefined)
    const outcomes = await Promise.allSettled(probes.map((provider) =>
      discoverCapabilities(this.registry, provider, signal),
    ))
    signal?.throwIfAborted()
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === 'fulfilled') continue
      const source = probes[index].source.id
      const error = asProviderError(outcome.reason, source)
      attempts?.push({ source, code: errorCode(error), message: error.message })
    }
    return this.registry.getEnabledByCapability(query)
  }

  /** 执行通用流转循环，只对确定性拒绝尝试下一个源。 */
  private async route<T>(
    query: SourceCapabilityQuery,
    identity: SourceRouterInstrumentIdentity,
    preferredSource: string | undefined,
    attached: InstrumentDescriptor | undefined,
    capability: RoutableCapability,
    signal: AbortSignal | undefined,
    fetch: (provider: MarketDataProvider, instrument: InstrumentDescriptor) => Promise<T>,
  ): Promise<RoutedMarketData<T>> {
    const attempts: SourceRouteAttempt[] = []
    signal?.throwIfAborted()
    const candidates = await this.getCandidates(query, preferredSource, signal, attempts)
    const label = [capability, identity.symbol, query.period, query.adjustment]
      .filter((part): part is string => typeof part === 'string')
      .join(' ')
    for (const provider of candidates) {
      try {
        signal?.throwIfAborted()
        const instrument = await resolveInstrument(provider, identity, attached, capability, signal)
        const series = await fetch(provider, instrument)
        return { series, provider, instrument, attempts: [...attempts] }
      } catch (error) {
        const normalized = asProviderError(error, provider.source.id)
        const code = errorCode(normalized)
        attempts.push({ source: provider.source.id, code, message: normalized.message })
        if (!isRoutableRejection(code)) throw normalized
      }
    }
    throw new SourceRoutingError(attempts, label, {
      capability,
      symbol: identity.symbol,
      ...(query.period === undefined ? {} : { period: query.period }),
      ...(query.adjustment === undefined ? {} : { adjustment: query.adjustment }),
    })
  }

  /** 请求 K 线并在确定性源拒绝时自动流转。 */
  async bars(request: SourceRouterBarsRequest): Promise<RoutedMarketData<BarSeries>> {
    return this.route(
      {
        capability: 'bars',
        instrumentType: request.instrumentType,
        period: request.period,
        adjustment: request.adjustment,
      },
      request,
      request.preferredSource,
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
      { capability: 'timeShare', instrumentType: request.instrumentType },
      request,
      request.preferredSource,
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
      { capability: 'timeShareRange', instrumentType: request.instrumentType, days: request.days },
      request,
      request.preferredSource,
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
