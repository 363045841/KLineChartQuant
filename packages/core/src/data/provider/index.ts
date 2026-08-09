/** 统一行情领域模型公共入口。 */

export {
  DEFAULT_V1_BASE_URL,
  V1_PROTOCOL_NAME,
  V1_PROTOCOL_VERSION,
  createHttpMarketDataV1Transport,
  createV1MarketDataProvider,
} from './protocol'
export type {
  MarketDataV1Transport,
  V1BarCapability,
  V1BarRequest,
  V1BarSeries,
  V1Envelope,
  V1ErrorEnvelope,
  V1ErrorCode,
  V1HistoryCoverage,
  V1HttpTransportOptions,
  V1InstrumentCapabilities,
  V1InstrumentDescriptor,
  V1InstrumentReference,
  V1InstrumentSearchRequest,
  V1InstrumentSearchResult,
  V1KLineItem,
  V1MarketDataProviderOptions,
  V1SourceProbe,
  V1SourceCapabilities,
  V1SourceRejectionCode,
  V1TimeShareItem,
  V1TimeShareRequest,
  V1TimeShareSeries,
} from './protocol'
export { V1_SOURCE_REJECTION_CODES } from './protocol'
export { MarketDataProviderRegistry, marketDataProviderRegistry } from './registry'
export type { MarketDataSourceConfig, MarketDataSourceConfigPatch } from './registry'
export { dataSourceRegistry } from './sourceRegistry'
export type { DataSourceRegistration } from './sourceRegistry'
export { createLegacyMarketDataAdapters } from './legacyAdapter'
export type {
  LegacyInstrumentResolveRequest,
  LegacyInstrumentResolver,
  LegacyMarketDataAdapterOptions,
  LegacyMarketDataAdapters,
} from './legacyAdapter'
export type {
  AssetClass,
  BarCapability,
  BarDataSource,
  BarQuery,
  BarSeries,
  DataSourceDescriptor,
  DepthDataSource,
  InstrumentCapabilities,
  InstrumentCatalog,
  InstrumentDescriptor,
  InstrumentSearchQuery,
  KLineAdjustment,
  KLinePeriod,
  MarketDataErrorCode,
  MarketDataFailure,
  MarketDataProvider,
  MarketDataSourceStatus,
  ProviderRef,
  SourceProbeResult,
  TimeShareDataSource,
  TimeShareQuery,
  TimeShareSeries,
  TradingDate,
  VolumeUnit,
} from './types'
