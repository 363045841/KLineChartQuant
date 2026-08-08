/** 数据层公共出口：导出行情 Provider、DataFetcher、数据缓冲与配置工具，并副作用注册内置数据源。 */
export {
  mockDataFetcher,
  hundredMockDataFetcher,
  thousandMockDataFetcher,
  mockMarketDataProvider,
} from './mock'
export { baostockDataFetcher } from './baostock'
export { routerDataFetcher, routerSearchFetchers, routerTimeShareFetcher } from './router'
export { DataBuffer } from './dataBuffer'
export type { DataWindow } from './dataBufferTypes'
export { TimeShareBuffer } from './timeShareBuffer'
export type { DataBufferLike } from './dataBufferTypes'
export {
  getRegisteredFetcher,
  getRegisteredFetchers,
  getRegisteredFetcherNames,
  getTimeShareFetcher,
  getSearchFetcher,
  fetcherHasCapability,
  fetcherSupportsSearch,
  fetcherSupportsTimeShare,
} from './fetcherDefinitionRegistry'
export {
  clearFetcherBaseUrlsForTest,
  composeFetcherBaseUrl,
  getFetcherBaseUrl,
  normalizeFetcherBaseUrl,
  parseFetcherEndpoint,
  setFetcherBaseUrl,
} from './fetcherBaseUrl'
export type {
  SearchConfig,
  SearchFetcherFn,
  SearchResult,
  TimeShareFetcherFn,
  TimeShareFetchConfig,
  TimeShareFetchResult,
  DataFetcherDefinition,
} from './types'
export {
  getPeriodDays,
  fetchKLine,
  fetchTimeShare,
  KLineFetchService,
  TimeShareFetchService,
} from './dataBuffer.effects'
export { BinanceSSESource, DEFAULT_BINANCE_SSE_URL } from './binance'
export { gotdxMarketDataProvider } from './gotdx'
export { DepthConnector } from './depthConnector'
export type { DepthSource, DepthDelta, DepthSnapshot, DepthSourceStatus } from './depthTypes'
export * from './marketData'
import './baostock'
import './mock'
import './gotdx'
import './tradingview'
