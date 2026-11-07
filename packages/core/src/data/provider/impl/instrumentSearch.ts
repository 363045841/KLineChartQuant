/** 聚合已启用行情数据源的无状态品种目录查询能力。 */
import { ERROR_CODES, GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { InstrumentDescriptor, InstrumentSearchQuery } from '../types.js'
import {
  formatInstrumentLabel,
  instrumentIdentityKey,
  parseInstrumentQuery,
} from './instrumentIdentity.js'
import type { MarketDataProviderRegistry } from './registry.js'

/** 跨数据源查询品种目录的输入。 */
export interface InstrumentSearchRequest extends InstrumentSearchQuery {
  /** 限定查询的数据源；省略时查询所有已启用数据源。 */
  sourceIds?: ReadonlyArray<string>
}

/** 按标准代码精确查询品种目录的输入。 */
export interface InstrumentLookupRequest {
  /** 待查询的品种代码。 */
  symbol: string
  /** 限定查询的数据源；省略时查询所有已启用数据源。 */
  sourceIds?: ReadonlyArray<string>
  /** 用于中断底层数据源请求的取消信号。 */
  signal?: AbortSignal
}

const INSTRUMENT_LOOKUP_CANDIDATE_LIMIT = 100

/** 统一代码比较规则，避免调用方各自实现大小写和空白处理。 */
function normalizeInstrumentSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

/** 从已启用数据源中搜索标准品种目录。 */
export async function searchInstruments(
  registry: MarketDataProviderRegistry,
  request: InstrumentSearchRequest,
): Promise<ReadonlyArray<InstrumentDescriptor>> {
  // `.P` 后缀在搜索入口还原为市场限定；空关键词不产生请求。
  const parsed = parseInstrumentQuery(request.keyword)
  if (!parsed.keyword) return []
  const market = request.market ?? parsed.market
  // 省略 sourceIds 表示查询全部已启用源；显式空数组表示不查任何源。
  const selectedSourceIds = request.sourceIds?.map((sourceId) => sourceId.trim()).filter(Boolean)
  const selectedSources = selectedSourceIds === undefined ? undefined : new Set(selectedSourceIds)
  const catalogProviders = registry
    .getSearchableByPriority()
    .filter((provider) => provider.catalog !== undefined)
  const availableSourceIds = catalogProviders.map((provider) => provider.source.id)
  if (selectedSources) {
    const unavailableSourceIds = [...selectedSources].filter(
      (sourceId) => !availableSourceIds.includes(sourceId),
    )
    if (unavailableSourceIds.length > 0) {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `[InstrumentSearch] sourceIds ${unavailableSourceIds.join(', ')} are unavailable for instrument lookup. Available sourceIds: ${availableSourceIds.join(', ') || 'none'}. Omit sourceIds to search every enabled source.`,
      )
    }
  }
  const providers = catalogProviders.filter(
    (provider) => !selectedSources || selectedSources.has(provider.source.id),
  )

  if (providers.length === 0) return []

  const settled = await Promise.allSettled(
    providers.map((provider) =>
      provider.catalog!.search({
        keyword: parsed.keyword,
        limit: request.limit,
        instrumentTypes: request.instrumentTypes,
        market,
        signal: request.signal,
      }),
    ),
  )
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<ReadonlyArray<InstrumentDescriptor>> =>
      result.status === 'fulfilled',
  )
  if (successful.length === 0) {
    throw new KLineChartError(
      ERROR_CODES.FETCH_FAILED,
      '[InstrumentSearch] all selected source searches failed',
    )
  }

  const instruments = new Map<string, InstrumentDescriptor>()
  for (const result of successful) {
    for (const instrument of result.value) {
      const key = instrumentIdentityKey(instrument)
      if (!instruments.has(key)) instruments.set(key, instrument)
    }
  }
  return [...instruments.values()].slice(0, request.limit)
}

/**
 * 在已启用数据源中按代码精确查询品种。
 * 复用目录搜索作为候选获取通道，精确匹配按展示代码比较：
 * `.P` 后缀是输入与展示共用的写法，实际 `symbol` 里不含它。
 */
export async function lookupInstrumentsBySymbol(
  registry: MarketDataProviderRegistry,
  request: InstrumentLookupRequest,
): Promise<ReadonlyArray<InstrumentDescriptor>> {
  const expected = normalizeInstrumentSymbol(request.symbol)
  if (!expected) return []

  const candidates = await searchInstruments(registry, {
    keyword: request.symbol,
    limit: INSTRUMENT_LOOKUP_CANDIDATE_LIMIT,
    sourceIds: request.sourceIds,
    signal: request.signal,
  })
  return candidates.filter(
    (instrument) => normalizeInstrumentSymbol(formatInstrumentLabel(instrument).code) === expected,
  )
}
