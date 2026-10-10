/** 控制器层公共出口：导出 framework-agnostic 控制器类型、工厂函数与引擎子模块的 facade 重导出。 */
// -- Controller types (framework-agnostic) --

export { MAIN_PANE_ID, PANE_HEADER_INSET_PX } from '../engine/pane/types.js'
export type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentDataRange,
  ChartAgentTimeRange,
  IndicatorQueryInput,
  InstrumentLookupInput,
} from '../features/agent/index.js'
export { getRegisteredChartTools } from '../features/agent/index.js'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
} from '../rendering/render/rendererHost.js'

export { createChartController } from './chart/index.js'
export {
  allIndicatorDefinitions,
  toIndicatorDefinition,
} from './indicatorDefinitionCatalog.js'
export type { ActiveIndicator, IndicatorSelectorController } from './indicatorSelector/index.js'
export { createIndicatorSelectorController } from './indicatorSelector/index.js'
export type { ChartRendererAccess } from './renderers/index.js'
export { getChartRenderers } from './renderers/index.js'
export type { ChartFrameCaptureContext } from './screenshot/types.js'
export type {
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
  DrawingLabelIndex,
  DrawingLabelPosition,
  DrawingObject,
  DrawingSessionPort,
  DrawingState,
  DrawingStyle,
  DrawingViewportPort,
  IndicatorDefinition,
  IndicatorInstance,
  IndicatorLoadingMode,
  IndicatorPaneRole,
  IndicatorParamDef,
  IndicatorRole,
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
} from './types.js'

// -- Interaction snapshot factory (value export; the type-only block above drops it) --
export { createIdleInteractionSnapshot, INDICATOR_ROLE } from './types.js'

// -- Engine sub-path re-exports (Phase 9: facade for Vue adapter) --

export type {
  BookSnapshot,
  HeatmapController,
  HeatmapControllerConfig,
  HeatmapState,
  OrderBookDelta,
} from '../components/orderBookHeatmap/index.js'
// Heatmap controller (depth pipeline rendering half)
export { createHeatmapController } from '../components/orderBookHeatmap/index.js'
export type {
  AssetClass,
  BarAggregation,
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
  LiveBar,
  LiveBarsFrame,
  LiveBarsStatus,
  LoadedTimeRange,
  MarketDataCacheStats,
  MarketDataErrorCode,
  MarketDataFailure,
  MarketDataProvider,
  MarketDataSourceConfig,
  MarketDataSourceConfigPatch,
  MarketDataSourceStatus,
  MarketTrade,
  ProviderRef,
  RealtimeBarsSink,
  SourceProbeResult,
  TimeShareDataSource,
  TimeShareQuery,
  TimeShareSeries,
  TradeBatch,
  TradeDataSource,
  TradeFrame,
  TradeRange,
  TradeSnapshot,
  TradeStatus,
  TradeStream,
  TradingDate,
  VolumeUnit,
} from '../data/index.js'
// Data access
export {
  ALIGNED_BAR_AGGREGATION,
  BAR_AGGREGATIONS,
  BarsLiveSource,
  baostockMarketDataProvider,
  binanceMarketDataProvider,
  DataBuffer,
  DepthConnector,
  dataSourceRegistry,
  EUROPE_TRADITIONAL_BAR_AGGREGATION,
  finshareMarketDataProvider,
  gotdxMarketDataProvider,
  MarketDataProviderRegistry,
  marketDataProviderRegistry,
  mockMarketDataProvider,
  mt5MarketDataProvider,
  ORIGINAL_BAR_AGGREGATION,
  RealtimeBarsConnector,
  searchInstruments,
  tradingviewMarketDataProvider,
} from '../data/index.js'
export type {
  ActiveMagnetMode,
  DrawingLineLabelTarget,
  DrawingToolId,
} from '../engine/drawing/index.js'
// Drawing
export {
  BOX_SELECT_DRAWING_TOOL_ID,
  CURSOR_DRAWING_TOOL_ID,
  DOUBLE_ANCHOR_TOOLS,
  DrawingInteractionController,
  DrawingTool,
  getAnchorCountForTool,
  MagnetMode,
  SINGLE_ANCHOR_TOOLS,
  TRIPLE_ANCHOR_TOOLS,
} from '../engine/drawing/index.js'
export type {
  IndicatorType,
  IndicatorTypeRegistry,
} from '../engine/indicators/indicatorMetadata.js'
export {
  BUILTIN_INDICATOR_TYPES,
  getBuiltinIndicatorTypeLabel,
  getBuiltinIndicatorTypeOrder,
} from '../engine/indicators/indicatorMetadata.js'
export { loadBuiltinIndicators } from '../engine/indicators/registerBuiltins.js'
export type {
  LayoutApi,
  LayoutDocument,
  LayoutSummary,
  NamedLayoutDocument,
} from '../engine/layout/index.js'
// Main-pane legend template context (Vue #legend slot)
export type {
  CreateLegendInput,
  LegendAction,
  LegendActionButton,
  LegendApi,
  LegendComparisonRow,
  LegendCurrentBar,
  LegendEntry,
  LegendIndicatorRow,
  LegendLayout,
  LegendOptions,
  LegendPatch,
  LegendRow,
  LegendTemplateContext,
  LegendText,
  LegendTimeshareRow,
  LegendUiRequest,
} from '../engine/legend/types.js'
export { LEGEND_UI_EVENT } from '../engine/legend/types.js'
// Indicator types & config
export type { SubIndicatorType } from '../engine/renderers/Indicator/index.js'
export type { Indicator } from '../engine/renderers/Indicator/indicatorCatalog.js'
// Indicator data helpers
export {
  allIndicators,
  findIndicator,
  isSubIndicatorId,
} from '../engine/renderers/Indicator/indicatorCatalog.js'
export { getPhysicalKLineConfig } from '../engine/viewport/klineConfig.js'
// Utility functions
export { kGapFromKWidth, zoomLevelToKWidth } from '../engine/viewport/zoom.js'
