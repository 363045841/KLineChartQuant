/** 聚合已启用行情数据源的无状态品种目录查询能力。 */
import { KLineChartError } from '../../errors'

import type { InstrumentDescriptor, InstrumentSearchQuery } from './types'
import type { MarketDataProviderRegistry } from './registry'

/** 跨数据源查询品种目录的输入。 */
export interface InstrumentSearchRequest extends InstrumentSearchQuery {
  /** 限定查询的数据源；省略时查询所有已启用数据源。 */
  sourceIds?: ReadonlyArray<string>
}

/** 生成数据源范围内品种的稳定去重键。 */
function instrumentIdentityKey(instrument: InstrumentDescriptor): string {
  return `${instrument.sourceId}:${instrument.id}`
}

/** 从已启用数据源中搜索标准品种目录。 */
export async function searchInstruments(
  registry: MarketDataProviderRegistry,
  request: InstrumentSearchRequest,
): Promise<ReadonlyArray<InstrumentDescriptor>> {
  const selectedSourceIds = request.sourceIds?.map((sourceId) => sourceId.trim()).filter(Boolean)
  const selectedSources = selectedSourceIds ? new Set(selectedSourceIds) : undefined
  const providers = registry
    .getEnabledByPriority()
    .filter((provider) => !selectedSources || selectedSources.has(provider.source.id))
    .filter((provider) => provider.catalog !== undefined)

  if (providers.length === 0) return []

  const settled = await Promise.allSettled(
    providers.map((provider) =>
      provider.catalog!.search({
        keyword: request.keyword,
        limit: request.limit,
        assetClasses: request.assetClasses,
        signal: request.signal,
      }),
    ),
  )
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<ReadonlyArray<InstrumentDescriptor>> =>
      result.status === 'fulfilled',
  )
  if (successful.length === 0) {
    throw new KLineChartError('FETCH_FAILED', '[InstrumentSearch] all selected source searches failed')
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
