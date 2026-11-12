/**
 * 分析数据采集器对外导出的统一入口。
 *
 * 三个数据线共用一套按天分片存储：
 * - 期权聚合位（永久）与期权原始链（90 天滚动）
 * - 币安买卖量（短周期 90 天滚动，日线及以上永久）
 * - cloudtrade 历史迁移（写在 `legacy/` 子树，与实时流隔离）
 */
export {
  ANALYTICS_ERROR_CODES,
  AnalyticsError,
  type AnalyticsErrorCode,
  toError,
} from './errors'
export {
  readCloudtradeOptionLevels,
  readCloudtradeVolume,
} from './migration/impl/cloudtrade'
export {
  type MigrateCloudtradeOptions,
  migrateCloudtradeData,
} from './migration/impl/migrate'
export {
  type CadenceStats,
  CLOUDTRADE_OPTION_SYMBOLS,
  CLOUDTRADE_SAMPLING_NOTE,
  CLOUDTRADE_SYMBOL_MAP,
  type CloudtradeOptionRecord,
  type CloudtradeOptionSource,
  type CloudtradeVolumeSource,
  type LegacyOptionLevelRecord,
  type LegacyVolumeBarRecord,
  type MigrationManifest,
  type MigrationResult,
  type VolumeIntervalImport,
} from './migration/types'
export { createNodeHttpsClient } from './net/impl/nodeHttpsClient'
export type {
  HttpClient,
  HttpGetOptions,
  HttpPostOptions,
  HttpTextResponse,
  ProxyEndpoint,
} from './net/types'
export {
  type AggregateOptionChainInput,
  aggregateOptionChain,
} from './options/impl/aggregate'
export { type Black76GammaInput, black76Gamma, standardNormalDensity } from './options/impl/black76'
export {
  type CollectedOptionCurrency,
  type CollectOptionsRequest,
  collectOptionCurrencies,
  OPTION_AGGREGATE_STREAM_PREFIX,
  OPTION_CHAIN_STREAM_PREFIX,
} from './options/impl/collect'
export {
  createDeribitClient,
  DEFAULT_DERIBIT_TIMEOUT_MS,
  DERIBIT_API_BASE,
  type DeribitClientOptions,
} from './options/impl/deribit'
export { type ParsedInstrumentName, parseInstrumentName } from './options/impl/instrument'
export {
  type DeribitClient,
  type DeribitIndexPrice,
  type DeribitOptionChain,
  OPTION_CHAIN_MAX_DTE_DAYS,
  OPTION_CHAIN_RETENTION_DAYS,
  OPTION_CURRENCIES,
  type OptionAggregateSnapshot,
  type OptionChainRecord,
  type OptionContract,
  type OptionCurrency,
  type OptionStrikeExposure,
  type OptionType,
} from './options/types'
export {
  type CollectedOrderflow,
  ORDERFLOW_STREAM_PREFIX,
  orderflowStream,
  persistOrderflowPanel,
  type VenueAppendSummary,
} from './orderflow/impl/collect'
export {
  type CollectTradesRequest,
  collectTradeBuckets,
  type VenueTradeRound,
} from './orderflow/impl/collectTrades'
export {
  buildDepthSnapshot,
  DEPTH_BANDS_DEFAULT,
  detectDepthDivergence,
  imbalanceAt,
} from './orderflow/impl/depth'
export {
  createDepthClient,
  DEFAULT_DEPTH_TIMEOUT_MS,
  type DepthClient,
  type DepthClientOptions,
  instrumentIdFor,
} from './orderflow/impl/depthVenues'
export {
  buildLargeOrderProfile,
  createFlowClient,
  DEFAULT_FLOW_TIMEOUT_MS,
  FLOW_WINDOWS,
  type FlowClient,
  type FlowClientOptions,
} from './orderflow/impl/flowVenues'
export {
  type AccumulatedTrade,
  addTrades,
  createAccumulator,
  HOUR_MS,
  type HourAccumulator,
  hourStartOf,
  sealAccumulator,
  shouldSeal,
  type TradeCoverage,
} from './orderflow/impl/largeOrderAccumulator'
export {
  buildTotals,
  createPanelClient,
  detectContradictions,
  hourFlowOf,
  type PanelClient,
  type PanelClientOptions,
} from './orderflow/impl/panel'
export {
  createPositioningClient,
  DEFAULT_POSITIONING_TIMEOUT_MS,
  type PositioningClient,
  type PositioningClientOptions,
} from './orderflow/impl/positioningVenues'
export { renderPanel, summarizeContradictions } from './orderflow/impl/render'
export { notionalOf, toBaseSize } from './orderflow/impl/units'
export {
  type Contradiction,
  type ContradictionKind,
  DEPTH_BANDS,
  type DepthBand,
  type DepthBandStats,
  type DepthLevel,
  type DepthSnapshot,
  type FlowStats,
  type LargeOrderBucket,
  type LargeOrderProfile,
  NEAR_LEVELS,
  ORDERFLOW_VENUES,
  type OrderflowPanel,
  type OrderflowVenue,
  type PanelTotals,
  type PositioningStats,
  type PriceWall,
  type VenueSnapshot,
  WALL_MULTIPLE,
} from './orderflow/types'
export {
  DEFAULT_ORDERFLOW_PORT,
  type OrderflowServerHandle,
  type OrderflowServerOptions,
  startOrderflowServer,
} from './serve/impl/server'
export { createDayShardStore } from './storage/impl/dayShardStore'
export type {
  DayAppendRequest,
  DayAppendResult,
  DayShardStore,
} from './storage/types'
export {
  BINANCE_API_BASE,
  BINANCE_MAX_KLINES,
  type BinanceClientOptions,
  createBinanceClient,
  DEFAULT_BINANCE_TIMEOUT_MS,
  DEFAULT_VOLUME_SYMBOLS,
  parseVolumeInterval,
  splitKline,
} from './volume/impl/binance'
export {
  type CollectedVolumeSeries,
  type CollectVolumeRequest,
  collectVolumeSeries,
  VOLUME_STREAM_PREFIX,
} from './volume/impl/collect'
export {
  type BinanceClient,
  type BinanceKlineRequest,
  type BinanceKlineResult,
  VOLUME_INTERVALS,
  VOLUME_PERMANENT_INTERVALS,
  VOLUME_SHORT_INTERVAL_RETENTION_DAYS,
  VOLUME_SPLIT_RELATIVE_TOLERANCE,
  type VolumeBar,
  type VolumeBarRecord,
  type VolumeInterval,
} from './volume/types'
