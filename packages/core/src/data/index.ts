/** 数据层公共出口：导出行情 Provider、DataFetcher、数据缓冲与配置工具，并副作用注册内置数据源。 */
export {
  mockDataFetcher,
  hundredMockDataFetcher,
  thousandMockDataFetcher,
} from './legacy/mock'
export { mockMarketDataProvider } from './provider/sources/mock'
export { baostockDataFetcher } from './legacy/baostock'
export { baostockMarketDataProvider } from './provider/sources/baostock'
export { finshareMarketDataProvider } from './provider/sources/finshare'
export { routerDataFetcher, routerSearchFetchers, routerTimeShareFetcher } from './legacy/router'
export { DataBuffer } from './buffer/dataBuffer'
export type { BarPageRequest, DataWindow } from './buffer/dataBufferTypes'
export { TimeShareBuffer } from './buffer/timeShareBuffer'
export type { DataBufferLike } from './buffer/dataBufferTypes'
export {
  getRegisteredFetcher,
  getRegisteredFetchers,
  getRegisteredFetcherNames,
  getTimeShareFetcher,
  getSearchFetcher,
  fetcherHasCapability,
  fetcherSupportsSearch,
  fetcherSupportsTimeShare,
} from './legacy/fetcherDefinitionRegistry'
export {
  clearFetcherBaseUrlsForTest,
  composeFetcherBaseUrl,
  getFetcherBaseUrl,
  normalizeFetcherBaseUrl,
  parseFetcherEndpoint,
  setFetcherBaseUrl,
} from './legacy/fetcherBaseUrl'
export type {
  SearchConfig,
  SearchFetcherFn,
  SearchResult,
  TimeShareFetcherFn,
  TimeShareFetchConfig,
  TimeShareFetchResult,
  DataFetcherDefinition,
} from './legacy/types'
export {
  getPeriodDays,
  fetchKLine,
  fetchTimeShare,
  KLineFetchService,
  TimeShareFetchService,
} from './buffer/dataBuffer.effects'
export { BinanceSSESource, DEFAULT_BINANCE_SSE_URL } from './depth/binance'
export { gotdxMarketDataProvider } from './provider/sources/gotdx'
export { tradingviewMarketDataProvider } from './provider/sources/tradingview'
export { DepthConnector } from './depth/depthConnector'
export type { DepthSource, DepthDelta, DepthSnapshot, DepthSourceStatus } from './depth/depthTypes'
export * from './provider'
import './legacy/baostock'
import './legacy/mock'
import './legacy/tradingview'
import './provider/sources/gotdx'
import './provider/sources/baostock'
import './provider/sources/finshare'
import './provider/sources/tradingview'
import './provider/sources/mock'
