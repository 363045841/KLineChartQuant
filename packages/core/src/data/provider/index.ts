/** 统一行情领域模型公共入口。 */

export type { InstrumentLookupRequest, InstrumentSearchRequest } from './instrumentSearch.js'
export { lookupInstrumentsBySymbol, searchInstruments } from './instrumentSearch.js'
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
} from './protocol/index.js'
export {
  createHttpMarketDataTransport,
  createMarketDataProvider,
  DEFAULT_V1_BASE_URL,
  SOURCE_REJECTION_CODES,
  V1_PROTOCOL_NAME,
  V1_PROTOCOL_VERSION,
} from './protocol/index.js'
export type {
  MarketDataSourceConfig,
  MarketDataSourceConfigPatch,
  SourceCapabilityQuery,
} from './registry.js'
export { MarketDataProviderRegistry, marketDataProviderRegistry } from './registry.js'
export type {
  RoutedMarketData,
  SourceRouteAttempt,
  SourceRouterBarsRequest,
  SourceRouterInstrumentIdentity,
  SourceRouterTimeShareRequest,
} from './router.js'
export { SourceRouter, SourceRoutingError, sourceRouter } from './router.js'
export type { DataSourceRegistration } from './sourceRegistry.js'
export { dataSourceRegistry } from './sourceRegistry.js'
export type {
  AssetClass,
  BarAggregation,
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
} from './types.js'
export {
  ALIGNED_BAR_AGGREGATION,
  BAR_AGGREGATIONS,
  EUROPE_TRADITIONAL_BAR_AGGREGATION,
  ORIGINAL_BAR_AGGREGATION,
} from './types.js'
