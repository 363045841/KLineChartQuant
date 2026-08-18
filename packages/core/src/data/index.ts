/** 数据层公共出口：导出行情 Provider、数据缓冲与配置工具，并副作用注册内置数据源。 */
export { mockMarketDataProvider } from './provider/sources/mock'
export { baostockMarketDataProvider } from './provider/sources/baostock'
export { finshareMarketDataProvider } from './provider/sources/finshare'
export { DataBuffer } from './buffer/dataBuffer'
export type { BarPageRequest, LoadedTimeRange } from './buffer/dataBufferTypes'
export { TimeShareBuffer } from './buffer/timeShareBuffer'
export type { DataBufferLike } from './buffer/dataBufferTypes'
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
import './provider/sources/gotdx'
import './provider/sources/baostock'
import './provider/sources/finshare'
import './provider/sources/tradingview'
import './provider/sources/mock'
