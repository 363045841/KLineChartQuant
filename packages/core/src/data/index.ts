/** 数据层公共出口：导出行情 Provider、数据缓冲与配置工具，并副作用注册内置数据源。 */

export { DataBuffer } from './buffer/dataBuffer.js'
export type { DataBufferLike, LoadedTimeRange } from './buffer/dataBufferTypes.js'
export type {
  BarsCacheQuery,
  BarsCacheResult,
  MarketDataCacheStats,
  TimeShareCacheQuery,
  TimeShareCacheResult,
  TimeShareRangeCacheQuery,
  TimeShareRangeCacheResult,
} from './buffer/marketDataCache.js'
export { MarketDataCache } from './buffer/marketDataCache.js'
export { getPeriodDays } from './buffer/marketDataPolicy.js'
export { TimeShareBuffer } from './buffer/timeShareBuffer.js'
export { BinanceSSESource, DEFAULT_BINANCE_SSE_URL } from './depth/binance.js'
export { DepthConnector } from './depth/depthConnector.js'
export type {
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
} from './depth/depthTypes.js'
export * from './provider/index.js'
export { baostockMarketDataProvider } from './provider/sources/baostock.js'
export { finshareMarketDataProvider } from './provider/sources/finshare.js'
export { gotdxMarketDataProvider } from './provider/sources/gotdx.js'
export { mockMarketDataProvider } from './provider/sources/mock.js'
export { tradingviewMarketDataProvider } from './provider/sources/tradingview.js'

import './provider/sources/gotdx.js'
import './provider/sources/baostock.js'
import './provider/sources/finshare.js'
import './provider/sources/tradingview.js'
import './provider/sources/mock.js'
