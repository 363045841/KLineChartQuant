/** 数据层公共出口：导出行情 Provider、数据缓冲与配置工具，并副作用注册内置数据源。 */

export { DataBuffer } from './buffer/dataBuffer'
export type { DataBufferLike, LoadedTimeRange } from './buffer/dataBufferTypes'
export type {
  BarsCacheQuery,
  BarsCacheResult,
  MarketDataCacheStats,
  TimeShareCacheQuery,
  TimeShareCacheResult,
  TimeShareRangeCacheQuery,
  TimeShareRangeCacheResult,
} from './buffer/marketDataCache'
export { MarketDataCache } from './buffer/marketDataCache'
export { getPeriodDays } from './buffer/marketDataPolicy'
export { TimeShareBuffer } from './buffer/timeShareBuffer'
export { BinanceSSESource, DEFAULT_BINANCE_SSE_URL } from './depth/binance'
export { DepthConnector } from './depth/depthConnector'
export type { DepthDelta, DepthSnapshot, DepthSource, DepthSourceStatus } from './depth/depthTypes'
export * from './provider'
export { baostockMarketDataProvider } from './provider/sources/baostock'
export { finshareMarketDataProvider } from './provider/sources/finshare'
export { gotdxMarketDataProvider } from './provider/sources/gotdx'
export { mockMarketDataProvider } from './provider/sources/mock'
export { tradingviewMarketDataProvider } from './provider/sources/tradingview'

import './provider/sources/gotdx'
import './provider/sources/baostock'
import './provider/sources/finshare'
import './provider/sources/tradingview'
import './provider/sources/mock'
