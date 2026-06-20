import type { KLineData, TimeShareData } from '../controllers/types'

export type FetchConfig = {
  symbol: string
  startDate: string
  endDate: string
  period: string
  adjust: string
  exchange?: string
}

export type TimeShareFetchConfig = {
  symbol: string
  exchange?: string
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
}