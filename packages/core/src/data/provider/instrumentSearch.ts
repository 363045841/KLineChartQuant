/** 聚合已启用行情数据源的无状态品种目录查询能力。 */
import { ERROR_CODES, GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { InstrumentDescriptor, InstrumentSearchQuery, InstrumentType } from './types.js'
import { isFilterableInstrumentType } from './types.js'
import type { MarketDataProviderRegistry } from './registry.js'

/** 跨数据源查询品种目录的输入。 */
export interface InstrumentSearchRequest extends InstrumentSearchQuery {
  /** 限定查询的数据源；省略时查询所有已启用数据源。 */
  sources?: ReadonlyArray<string>
}

/** 按标准代码精确查询品种目录的输入。 */
export interface InstrumentLookupRequest {
  /** 待查询的品种代码。 */
  symbol: string
  /** 限定查询的数据源；省略时查询所有已启用数据源。 */
  sources?: ReadonlyArray<string>
  /** 用于中断底层数据源请求的取消信号。 */
  signal?: AbortSignal
}

/**
 * 目录查询结果。
 *
 * 失败的源单独列出：调用方不能把“某个源没查成”当成“这个源没有该品种”，
 * 否则会给出错误的不存在结论。
 */
export interface InstrumentSearchResult {
  readonly instruments: ReadonlyArray<InstrumentDescriptor>
  /** 本次实际参与查询的源。 */
  readonly searchedSources: ReadonlyArray<string>
  /** 查询失败的源；为空表示全部源都完成了查询。 */
  readonly failedSources: ReadonlyArray<string>
}

/** 单次精确查询向每个源请求的候选上限；路由层与搜索层共用同一个值。 */
export const INSTRUMENT_LOOKUP_CANDIDATE_LIMIT = 100

/** 生成数据源范围内品种的稳定去重键。 */
function instrumentIdentityKey(instrument: InstrumentDescriptor): string {
  return `${instrument.source}:${instrument.id}`
}

/** 统一代码比较规则，避免调用方各自实现大小写和空白处理。 */
function normalizeInstrumentSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

/**
 * 判断候选是否满足交易所与类别过滤。
 *
 * 精确查询与对比消歧共用这一条规则：交易所大小写不敏感，`unknown` 类别不参与过滤。
 */
export function matchesInstrumentFilter(
  candidate: InstrumentDescriptor,
  identity: { readonly exchange?: string; readonly instrumentType?: InstrumentType },
): boolean {
  const exchange = identity.exchange?.trim().toUpperCase()
  const instrumentType = isFilterableInstrumentType(identity.instrumentType)
    ? identity.instrumentType
    : undefined
  return (
    (exchange === undefined || candidate.exchange.toUpperCase() === exchange) &&
    (instrumentType === undefined || candidate.instrumentType === instrumentType)
  )
}

/**
 * 判断候选是否精确命中目标品种。
 *
 * 代码、交易所与类别规则只在这里定义；搜索与路由都复用它，避免两套过滤漂移。
 */
function isExactInstrument(
  candidate: InstrumentDescriptor,
  identity: { readonly symbol: string; readonly exchange?: string; readonly instrumentType?: InstrumentType },
  source?: string,
): boolean {
  return (
    normalizeInstrumentSymbol(candidate.symbol) === normalizeInstrumentSymbol(identity.symbol) &&
    (source === undefined || candidate.source === source) &&
    matchesInstrumentFilter(candidate, identity)
  )
}

/** 从候选里取第一个精确命中；没有命中时返回 undefined。 */
export function pickExactInstrument(
  candidates: ReadonlyArray<InstrumentDescriptor>,
  identity: { readonly symbol: string; readonly exchange?: string; readonly instrumentType?: InstrumentType },
  source?: string,
): InstrumentDescriptor | undefined {
  return candidates.find((candidate) => isExactInstrument(candidate, identity, source))
}

/** 从已启用数据源中搜索标准品种目录。 */
export async function searchInstruments(
  registry: MarketDataProviderRegistry,
  request: InstrumentSearchRequest,
): Promise<InstrumentSearchResult> {
  // 省略 sources 表示查询全部已启用源；显式空数组表示不查任何源。
  const requestedSources = request.sources?.map((source) => source.trim()).filter(Boolean)
  const selectedSources =
    requestedSources === undefined ? undefined : new Set(requestedSources)
  const catalogProviders = registry
    .getSearchableByPriority()
    .filter((provider) => provider.catalog !== undefined)
  const availableSources = catalogProviders.map((provider) => provider.source.id)
  if (selectedSources) {
    const unavailableSources = [...selectedSources].filter(
      (source) => !availableSources.includes(source),
    )
    if (unavailableSources.length > 0) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `[InstrumentSearch] sources ${unavailableSources.join(', ')} are unavailable for instrument lookup. Available sources: ${availableSources.join(', ') || 'none'}. Omit sources to search every enabled source.`,
      )
    }
  }
  const providers = catalogProviders.filter(
    (provider) => !selectedSources || selectedSources.has(provider.source.id),
  )
  const searchedSources = providers.map((provider) => provider.source.id)
  if (providers.length === 0)
    return { instruments: [], searchedSources: [], failedSources: [] }

  const settled = await Promise.allSettled(
    providers.map((provider) =>
      provider.catalog!.search({
        keyword: request.keyword,
        limit: request.limit,
        instrumentTypes: request.instrumentTypes,
        signal: request.signal,
      }),
    ),
  )
  const failedSources = settled.flatMap((result, index) =>
    result.status === 'rejected' ? [searchedSources[index]!] : [],
  )
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<ReadonlyArray<InstrumentDescriptor>> =>
      result.status === 'fulfilled',
  )
  if (successful.length === 0) {
    throw new KLineChartError(
      ERROR_CODES.FETCH_FAILED,
      `[InstrumentSearch] every selected source failed: ${failedSources.join(', ')}.`,
      { details: { searchedSources, failedSources } },
    )
  }

  const instruments = new Map<string, InstrumentDescriptor>()
  for (const result of successful) {
    for (const instrument of result.value) {
      const key = instrumentIdentityKey(instrument)
      if (!instruments.has(key)) instruments.set(key, instrument)
    }
  }
  return {
    instruments: [...instruments.values()].slice(0, request.limit),
    searchedSources,
    failedSources,
  }
}

/**
 * 在已启用数据源中按代码精确查询品种。
 * 复用目录搜索作为候选获取通道，精确匹配规则由 Core 统一保证。
 */
export async function lookupInstrumentsBySymbol(
  registry: MarketDataProviderRegistry,
  request: InstrumentLookupRequest,
): Promise<InstrumentSearchResult> {
  const symbol = normalizeInstrumentSymbol(request.symbol)
  if (!symbol) return { instruments: [], searchedSources: [], failedSources: [] }
  const result = await searchInstruments(registry, {
    keyword: symbol,
    limit: INSTRUMENT_LOOKUP_CANDIDATE_LIMIT,
    sources: request.sources,
    signal: request.signal,
  })
  return {
    instruments: result.instruments.filter((instrument) =>
      isExactInstrument(instrument, { symbol: request.symbol }),
    ),
    searchedSources: result.searchedSources,
    failedSources: result.failedSources,
  }
}
