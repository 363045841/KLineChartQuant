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
  sources?: ReadonlyArray<string>
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
  /**
   * 网络数据源的默认 Base URL
   * 有此字段时聚合源面板可编辑地址与端口；本地 mock 等无网络源不填
   */
  defaultBaseUrl?: string
}

export interface DataFetcherDefinition extends DataFetcherDefinitionConfig {
  fetcher: DataFetcherFn
  timeShareFetcher?: TimeShareFetcherFn
  searcher?: SearchFetcherFn
}
