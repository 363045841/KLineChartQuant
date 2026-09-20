// 行情协议公共入口：导出契约类型、HTTP 实现与通用 Provider 装配器

export type { HttpTransportOptions, ProtocolBaseUrl } from './httpTransport.js'
export { createHttpMarketDataTransport, DEFAULT_V1_BASE_URL } from './httpTransport.js'
export type { MarketDataProviderOptions } from './provider.js'
export { createMarketDataProvider } from './provider.js'
export type {
  MarketDataTransport,
  MarketTickTransport,
  ProtocolBarCapability,
  ProtocolBarRequest,
  ProtocolBarSeries,
  ProtocolEnvelope,
  ProtocolErrorCode,
  ProtocolErrorEnvelope,
  ProtocolHistoryCoverage,
  ProtocolInstrumentCapabilities,
  ProtocolInstrumentDescriptor,
  ProtocolInstrumentReference,
  ProtocolInstrumentSearchRequest,
  ProtocolInstrumentSearchResult,
  ProtocolKLineItem,
  ProtocolMarketTickItem,
  ProtocolMarketTickStreamHandlers,
  ProtocolMarketTickStreamRequest,
  ProtocolMarketTicksEvent,
  ProtocolSourceCapabilities,
  ProtocolSourceProbe,
  ProtocolSourceRejectionCode,
  ProtocolTimeShareDay,
  ProtocolTimeShareItem,
  ProtocolTimeShareRangeCapability,
  ProtocolTimeShareRangeRequest,
  ProtocolTimeShareRangeSeries,
  ProtocolTimeShareRequest,
  ProtocolTimeShareSeries,
} from './types.js'
export { SOURCE_REJECTION_CODES, V1_PROTOCOL_NAME, V1_PROTOCOL_VERSION } from './types.js'
