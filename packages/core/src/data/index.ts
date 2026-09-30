/** 数据层公共出口：导出行情 Provider、数据缓冲与配置工具，并副作用注册内置数据源。 */

export { DataBuffer } from './buffer/impl/dataBuffer.js'
export type {
  BarsCacheQuery,
  BarsCacheResult,
  MarketDataCacheStats,
  TimeShareCacheQuery,
  TimeShareCacheResult,
  TimeShareRangeCacheQuery,
  TimeShareRangeCacheResult,
} from './buffer/impl/marketDataCache.js'
export { MarketDataCache } from './buffer/impl/marketDataCache.js'
export { getPeriodDays } from './buffer/impl/marketDataPolicy.js'
export { TimeShareBuffer } from './buffer/impl/timeShareBuffer.js'
export type { DataBufferLike, LoadedTimeRange } from './buffer/types.js'
export { BinanceSSESource, DEFAULT_BINANCE_SSE_URL } from './depth/impl/binance.js'
export { DepthConnector } from './depth/impl/depthConnector.js'
export type {
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
} from './depth/types.js'
export type {
  LiveBar,
  LiveBarsFrame,
  LiveBarsStatus,
  RealtimeBarsSink,
} from './live/impl/barsLive.js'
export {
  BarsLiveSource,
  BarsLiveSubscription,
  RealtimeBarsConnector,
} from './live/impl/barsLive.js'
export * from './provider/impl/sources/index.js'
export * from './provider/index.js'
