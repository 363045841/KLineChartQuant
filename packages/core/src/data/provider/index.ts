/** 统一行情领域模型公共入口。 */

export type { InstrumentLookupRequest, InstrumentSearchRequest } from './instrumentSearch'
export { lookupInstrumentsBySymbol, searchInstruments } from './instrumentSearch'
export type {
  HttpTransportOptions,
  MarketDataProviderOptions,
  MarketDataTransport,
  ProtocolBarCapability,
  ProtocolBarRequest,
  ProtocolBarSeries,
  ProtocolBaseUrl,
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
} from './protocol'
export {
  createHttpMarketDataTransport,
  createMarketDataProvider,
  DEFAULT_V1_BASE_URL,
  SOURCE_REJECTION_CODES,
  V1_PROTOCOL_NAME,
  V1_PROTOCOL_VERSION,
} from './protocol'
export type {
  MarketDataSourceConfig,
  MarketDataSourceConfigPatch,
  SourceCapabilityQuery,
} from './registry'
export { MarketDataProviderRegistry, marketDataProviderRegistry } from './registry'
export type {
  RoutedMarketData,
  SourceRouteAttempt,
  SourceRouterBarsRequest,
  SourceRouterInstrumentIdentity,
  SourceRouterTimeShareRequest,
} from './router'
export { SourceRouter, SourceRoutingError, sourceRouter } from './router'
export type { DataSourceRegistration } from './sourceRegistry'
export { dataSourceRegistry } from './sourceRegistry'
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
  SourceCapabilities,
  SourceProbeResult,
  TimeShareDataSource,
  TimeShareDay,
  TimeShareQuery,
  TimeShareRange,
  TimeShareRangeCapability,
  TimeShareRangeDataSource,
  TimeShareRangeQuery,
  TimeShareSeries,
  TradingDate,
  VolumeUnit,
} from './types'
