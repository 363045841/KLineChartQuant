/** 控制器层公共出口：导出 framework-agnostic 控制器类型、工厂函数与引擎子模块的 facade 重导出。 */
// -- Controller types (framework-agnostic) --

export { PANE_HEADER_INSET_PX } from '../engine/chartTypes'
export type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentDataRange,
  ChartAgentTimeRange,
  IndicatorQueryInput,
  InstrumentLookupInput,
} from '../features/agent'
export { getRegisteredChartTools } from '../features/agent'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
} from '../rendering/render/rendererHost'

export { createChartController } from './createChartController'
export { createIndicatorSelectorController } from './createIndicatorSelectorController'
export {
  allIndicatorDefinitions,
  toIndicatorDefinition,
} from './indicatorDefinitionCatalog'
export type {
  ActiveIndicator,
  ChartController,
  ChartControllerFactory,
  ChartIndicatorConfig,
  ChartMountOptions,
  ChartViewport,
  CreateDrawingInput,
  CustomDataSource,
  DataSourceParams,
  DrawingChartAdapter,
  DrawingChartViewport,
  DrawingController,
  DrawingControllerCallbacks,
  DrawingDocumentPort,
  DrawingObject,
  DrawingSessionPort,
  DrawingState,
  DrawingViewportPort,
  IndicatorDefinition,
  IndicatorInstance,
  IndicatorPaneRole,
  IndicatorParamDef,
  IndicatorRole,
  IndicatorSelectorController,
  InteractionSnapshot,
  KLineData,
  PaneLayoutInfo,
  PaneSpec,
  SubPaneInfo,
  SymbolInfo,
  SymbolSpec,
  ToolbarController,
  ToolDefinition,
  ToolId,
  UpdateDrawingPatch,
} from './types'

// -- Engine sub-path re-exports (Phase 9: facade for Vue adapter) --

export type {
  BookSnapshot,
  HeatmapController,
  HeatmapControllerConfig,
  HeatmapState,
  OrderBookDelta,
} from '../components/orderBookHeatmap'
// Heatmap controller (depth pipeline rendering half)
export { createHeatmapController } from '../components/orderBookHeatmap'
export type {
  AssetClass,
  BarCapability,
  BarDataSource,
  BarQuery,
  BarSeries,
  DataSourceDescriptor,
  DepthDataSource,
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
  InstrumentCapabilities,
  InstrumentCatalog,
  InstrumentDescriptor,
  InstrumentSearchQuery,
  KLineAdjustment,
  KLinePeriod,
  LoadedTimeRange,
  MarketDataCacheStats,
  MarketDataErrorCode,
  MarketDataFailure,
  MarketDataProvider,
  MarketDataSourceConfig,
  MarketDataSourceConfigPatch,
  MarketDataSourceStatus,
  ProviderRef,
  SourceProbeResult,
  TimeShareDataSource,
  TimeShareQuery,
  TimeShareSeries,
  TradingDate,
  VolumeUnit,
} from '../data'
// Data access
export {
  BinanceSSESource,
  baostockMarketDataProvider,
  DataBuffer,
  DEFAULT_BINANCE_SSE_URL,
  DepthConnector,
  dataSourceRegistry,
  finshareMarketDataProvider,
  gotdxMarketDataProvider,
  MarketDataProviderRegistry,
  marketDataProviderRegistry,
  mockMarketDataProvider,
  tradingviewMarketDataProvider,
} from '../data'
export type { DrawingLineLabelTarget, DrawingToolId } from '../engine/drawing'
// Drawing
export {
  DOUBLE_ANCHOR_TOOLS,
  DrawingInteractionController,
  getAnchorCountForTool,
  SINGLE_ANCHOR_TOOLS,
  TRIPLE_ANCHOR_TOOLS,
} from '../engine/drawing'
export type { IndicatorType, IndicatorTypeRegistry } from '../engine/indicators/indicatorMetadata'
export {
  BUILTIN_INDICATOR_TYPES,
  getBuiltinIndicatorTypeLabel,
  getBuiltinIndicatorTypeOrder,
} from '../engine/indicators/indicatorMetadata'
export {
  isBuiltinIndicatorsLoaded,
  loadBuiltinIndicators,
} from '../engine/indicators/registerBuiltins'
// Indicator types & config
export type { SubIndicatorType } from '../engine/renderers/Indicator'
export type { Indicator } from '../engine/renderers/Indicator/indicatorCatalog'
// Indicator data helpers
export {
  allIndicators,
  findIndicator,
  isSubIndicatorId,
} from '../engine/renderers/Indicator/indicatorCatalog'
export type { CanvasLegendOptions } from '../engine/renderers/Indicator/mainIndicatorLegend'
// Main-pane legend template context (Vue #legend slot / external renderers)
export type {
  LegendComparisonRow,
  LegendCurrentBar,
  LegendIndicatorRow,
  LegendLayout,
  LegendRenderMode,
  LegendTemplateContext,
  LegendTimeshareRow,
} from '../engine/renderers/Indicator/mainIndicatorLegendContext'
export { getPhysicalKLineConfig } from '../engine/utils/klineConfig'
// Utility functions
export { kGapFromKWidth, zoomLevelToKWidth } from '../engine/utils/zoom'
