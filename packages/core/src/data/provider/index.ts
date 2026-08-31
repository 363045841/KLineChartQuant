/** 统一行情领域模型公共入口。 */

export {
  DEFAULT_V1_BASE_URL,
  V1_PROTOCOL_NAME,
  V1_PROTOCOL_VERSION,
  createHttpMarketDataTransport,
  createMarketDataProvider,
} from './protocol'
export type {
  HttpTransportOptions,
  MarketDataProviderOptions,
  MarketDataTransport,
  ProtocolBarCapability,
  ProtocolBarRequest,
  ProtocolBarSeries,
  ProtocolBaseUrl,
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
} from './protocol'
export { SOURCE_REJECTION_CODES } from './protocol'
export { MarketDataProviderRegistry, marketDataProviderRegistry } from './registry'
export type {
  MarketDataSourceConfig,
  MarketDataSourceConfigPatch,
  SourceCapabilityQuery,
} from './registry'
export { lookupInstrumentsBySymbol, searchInstruments } from './instrumentSearch'
export type { InstrumentLookupRequest, InstrumentSearchRequest } from './instrumentSearch'
export { SourceRouter, SourceRoutingError, sourceRouter } from './router'
export type {
  RoutedMarketData,
  SourceRouteAttempt,
  SourceRouterBarsRequest,
  SourceRouterInstrumentIdentity,
  SourceRouterTimeShareRequest,
} from './router'
export { dataSourceRegistry } from './sourceRegistry'
export type { DataSourceRegistration } from './sourceRegistry'
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
  SourceCapabilities,
  TimeShareDataSource,
  TimeShareDay,
  TimeShareRangeCapability,
  TimeShareRangeDataSource,
  TimeShareRange,
  TimeShareRangeQuery,
  TimeShareQuery,
  TimeShareSeries,
  TradingDate,
  VolumeUnit,
} from './types'
