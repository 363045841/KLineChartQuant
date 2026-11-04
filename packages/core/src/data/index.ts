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
export type { DataBufferLike, LoadedTimeRange } from './buffer/types.js'
export { DepthConnector } from './depth/impl/depthConnector.js'
export type {
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
} from './depth/types.js'
export type {
  LiveBar,
  LiveFrame,
  LiveQuote,
  RealtimeChannel,
  RealtimeConnection,
  RealtimeConnectionFactory,
  RealtimeConnectionRequest,
  RealtimeStatus,
  RealtimeSubscription,
  RealtimeSubscriptionPool,
  RealtimeSubscriptionRequest,
} from './live/types.js'
export type { RealtimeBarsSink } from './live/impl/barsConnector.js'
export { RealtimeBarsConnector } from './live/impl/barsConnector.js'
export {
  createRealtimeSubscriptionPool,
  realtimePoolFor,
  realtimeSubscriptionPool,
} from './live/impl/realtimePool.js'
export { createSseConnection } from './live/impl/sseConnection.js'
export * from './provider/impl/sources/index.js'
export * from './provider/index.js'
export type {
  MarketTrade,
  TradeBatch,
  TradeDataSource,
  TradeFrame,
  TradeRange,
  TradeSnapshot,
  TradeStatus,
  TradeStream,
} from './trades/types.js'
