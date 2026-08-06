/** 统一行情领域模型公共入口。 */

export { MarketDataProviderRegistry, marketDataProviderRegistry } from './providerRegistry'
export type { MarketDataSourceConfig, MarketDataSourceConfigPatch } from './providerRegistry'
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
