// 行情协议公共入口：导出契约类型、HTTP 实现与通用 Provider 装配器
export { DEFAULT_V1_BASE_URL, createHttpMarketDataV1Transport } from './httpTransport'
export type { HttpTransportOptions, ProtocolBaseUrl } from './httpTransport'
export { createV1MarketDataProvider } from './provider'
export type { MarketDataProviderOptions } from './provider'
export { V1_PROTOCOL_NAME, V1_PROTOCOL_VERSION } from './types'
export type {
  MarketDataTransport,
  ProtocolBarCapability,
  ProtocolBarRequest,
  ProtocolBarSeries,
  ProtocolEnvelope,
  ProtocolErrorEnvelope,
  ProtocolErrorCode,
  ProtocolHistoryCoverage,
  ProtocolInstrumentCapabilities,
  ProtocolInstrumentDescriptor,
  ProtocolInstrumentReference,
  ProtocolInstrumentSearchRequest,
  ProtocolInstrumentSearchResult,
  ProtocolKLineItem,
  ProtocolSourceProbe,
  ProtocolSourceCapabilities,
  ProtocolSourceRejectionCode,
  ProtocolTimeShareItem,
  ProtocolTimeShareDay,
  ProtocolTimeShareRangeCapability,
  ProtocolTimeShareRangeRequest,
  ProtocolTimeShareRangeSeries,
  ProtocolTimeShareRequest,
  ProtocolTimeShareSeries,
} from './types'
export { V1_SOURCE_REJECTION_CODES } from './types'
