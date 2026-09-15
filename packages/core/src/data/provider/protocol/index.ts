// 行情协议公共入口：导出契约类型、HTTP 实现与通用 Provider 装配器

export type { HttpTransportOptions, ProtocolBaseUrl } from './httpTransport'
export { createHttpMarketDataTransport, DEFAULT_V1_BASE_URL } from './httpTransport'
export type { MarketDataProviderOptions } from './provider'
export { createMarketDataProvider } from './provider'
export type {
  MarketDataTransport,
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
} from './types'
export { SOURCE_REJECTION_CODES, V1_PROTOCOL_NAME, V1_PROTOCOL_VERSION } from './types'
