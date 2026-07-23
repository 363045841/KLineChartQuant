import type { DataSourceParams, KLineData, TimeShareData } from '../controllers/types'

export type FetchConfig = {
  symbol: string
  startDate: string
  endDate: string
  period: string
  adjust: string
  exchange?: string
  params?: DataSourceParams
}

export type TimeShareFetchConfig = {
  symbol: string
  exchange?: string
  params?: DataSourceParams
  /** YYYYMMDD format query date, e.g. 20260618 */
  date?: number
}

export type DataFetcherFn = (
  source: string,
  config: FetchConfig,
) => Promise<ReadonlyArray<KLineData>>

export type TimeShareFetcherFn = (
  source: string,
  config: TimeShareFetchConfig,
) => Promise<ReadonlyArray<TimeShareData>>

export interface SearchConfig {
  query: string
  limit?: number
  signal?: AbortSignal
}

export interface SearchResult {
  symbol: string
  description: string
  exchange: string
  source: string
  params?: DataSourceParams
}

export type SearchFetcherFn = (
  source: string,
  config: SearchConfig,
) => Promise<ReadonlyArray<SearchResult>>

export interface DataFetcherDefinitionConfig {
  name: string
  displayName: string
  description?: string
  version?: string
  capabilities?: string[]
}

export interface DataFetcherDefinition extends DataFetcherDefinitionConfig {
  fetcher: DataFetcherFn
  timeShareFetcher?: TimeShareFetcherFn
  searcher?: SearchFetcherFn
}
