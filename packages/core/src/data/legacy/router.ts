import type { DataFetcher } from '../../controllers/types'
import { KLineChartError } from '../../errors'

import {
  getRegisteredFetcher,
  fetcherSupportsPeriod,
  getTimeShareFetcher,
  getRegisteredFetcherNames,
  getSearchFetcher,
} from './fetcherDefinitionRegistry'
import type { SearchConfig, SearchResult, TimeShareFetcherFn } from './types'

export const routerDataFetcher: DataFetcher = (source, config) => {
  const def = getRegisteredFetcher(source)
  if (!def) {
    const registered = getRegisteredFetcherNames().sort()
    return Promise.reject(
      new KLineChartError(
        'FETCH_FAILED',
        `[DataFetcher] unknown source "${source}". Registered sources: ${registered.join(', ') || 'none'}`,
      ),
    )
  }

  if (!fetcherSupportsPeriod(source, config.period)) {
    return Promise.reject(
      new KLineChartError(
        'FETCH_FAILED',
        `[DataFetcher] "${source}" does not support period "${config.period}". Supported: ${def.capabilities?.join(', ') ?? 'none'}`,
      ),
    )
  }

  return def.fetcher(source, config)
}

export const routerTimeShareFetcher: TimeShareFetcherFn = (source, config) => {
  const fetcher = getTimeShareFetcher(source)
  if (!fetcher) {
    return Promise.reject(
      new KLineChartError(
        'FETCH_FAILED',
        `[DataFetcher] "${source}" does not support timeshare data fetching`,
      ),
    )
  }
  return fetcher(source, config)
}

/** 优先按统一品种 ID 去重，旧搜索结果回退到完整来源身份。 */
function searchResultKey(result: SearchResult): string {
  if (result.id?.trim()) return `id:${result.id.trim()}`
  const params = Object.entries(result.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([result.source, result.market, result.exchange, result.symbol, params])
}

export async function routerSearchFetchers(
  config: SearchConfig,
): Promise<ReadonlyArray<SearchResult>> {
  const sourceNames = config.sources ? [...new Set(config.sources)] : getRegisteredFetcherNames()
  const searchers = sourceNames.flatMap((source) => {
    const searcher = getSearchFetcher(source)
    return searcher ? [{ source, searcher }] : []
  })
  if (config.sources && searchers.length === 0) return []
  if (searchers.length === 0) {
    throw new KLineChartError('FETCH_FAILED', '[DataFetcher] no registered fetcher supports search')
  }

  const settled = await Promise.allSettled(
    searchers.map(({ source, searcher }) => searcher(source, config)),
  )
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<ReadonlyArray<SearchResult>> =>
      result.status === 'fulfilled',
  )
  if (successful.length === 0) {
    throw new KLineChartError('FETCH_FAILED', '[DataFetcher] all search fetchers failed')
  }

  const limit = config.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, config.limit)
  const unique = new Map<string, SearchResult>()
  for (const result of successful) {
    for (const item of result.value) {
      const key = searchResultKey(item)
      if (!unique.has(key)) unique.set(key, item)
    }
  }
  return [...unique.values()].slice(0, limit)
}
