import type { DataSourceParams, KLineData, TimeShareData } from '../controllers/types'
import type { AssetClass, InstrumentCapabilities } from './marketData/types'

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

/** 分时拉取结果：点列 + 昨收元数据（与具体市场无关的统一契约） */
export type TimeShareFetchResult = {
  data: ReadonlyArray<TimeShareData>
  /** 昨收；缺失或无效时为 null，渲染侧不得回退首笔价 */
  preClose: number | null
}

export type TimeShareFetcherFn = (
  source: string,
  config: TimeShareFetchConfig,
) => Promise<TimeShareFetchResult | ReadonlyArray<TimeShareData>>

export interface SearchConfig {
  query: string
  limit?: number
  signal?: AbortSignal
  sources?: ReadonlyArray<string>
}

export interface SearchResult {
  /** 统一行情模型提供的稳定品种 ID；旧数据源结果可暂时缺失。 */
  id?: string
  assetClass?: AssetClass
  sessionId?: string
  capabilities?: InstrumentCapabilities
  symbol: string
  description: string
  exchange: string
  market: string
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
