// 行情协议公共入口：导出契约类型、HTTP 实现与通用 Provider 装配器
export { DEFAULT_V1_BASE_URL, createHttpMarketDataV1Transport } from './httpTransport'
export type { V1HttpTransportOptions } from './httpTransport'
export { createV1MarketDataProvider } from './provider'
export type { V1MarketDataProviderOptions } from './provider'
export { V1_PROTOCOL_NAME, V1_PROTOCOL_VERSION } from './types'
export type {
  MarketDataV1Transport,
  V1BarCapability,
  V1BarRequest,
  V1BarSeries,
  V1Envelope,
  V1ErrorEnvelope,
  V1ErrorCode,
  V1HistoryCoverage,
  V1InstrumentCapabilities,
  V1InstrumentDescriptor,
  V1InstrumentReference,
  V1InstrumentSearchRequest,
  V1InstrumentSearchResult,
  V1KLineItem,
  V1SourceProbe,
  V1SourceCapabilities,
  V1SourceRejectionCode,
  V1TimeShareItem,
  V1TimeShareRequest,
  V1TimeShareSeries,
} from './types'
export { V1_SOURCE_REJECTION_CODES } from './types'
