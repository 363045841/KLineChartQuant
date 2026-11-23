/** 数据层公共出口：导出行情 Provider、数据缓冲与配置工具，并副作用注册内置数据源。 */

export { DataBuffer } from './buffer/impl/dataBuffer.js'
export type { MarketDataCacheStats } from './buffer/impl/marketDataCache.js'
export type { LoadedTimeRange } from './buffer/types.js'
export { DepthConnector } from './depth/impl/depthConnector.js'
export type {
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
} from './depth/types.js'
export * from './stream/index.js'
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
