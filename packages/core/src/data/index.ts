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
export type {
  LiveBar,
  LiveBarsFrame,
  LiveBarsStatus,
  RealtimeBarsSink,
} from './live/barsLive.js'
export { BarsLiveSource, BarsLiveSubscription, RealtimeBarsConnector } from './live/barsLive.js'
export * from './provider/index.js'
export * from './provider/sources/index.js'
