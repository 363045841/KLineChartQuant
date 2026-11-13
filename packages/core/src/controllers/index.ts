/** 控制器层公共出口：导出 framework-agnostic 控制器类型、工厂函数与引擎子模块的 facade 重导出。 */
// -- Controller types (framework-agnostic) --

export type {
  IndicatorTemplateApi,
  IndicatorTemplateApplyResult,
  IndicatorTemplateIndicator,
  IndicatorTemplateSummary,
} from '../engine/indicatorTemplate/types.js'
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
export {
  type ChartDataView,
  ChartDataViewId,
  isTimeShareDataView,
} from '../foundation/types/chartView.js'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
} from '../rendering/render/rendererHost.js'
export { createChartController } from './chart/index.js'
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
  DrawingTimeframeVisibility,
  DrawingViewportPort,
  IndicatorDefinition,
  IndicatorInstance,
  IndicatorLoadingMode,
  IndicatorPaneRole,
  IndicatorParamDef,
  IndicatorRole,
  InteractionSnapshot,
  KLineData,
  PaneGeometry,
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
// 选择器与公共 API 共用同一个目录信号，注册表变更即重建。
export {
  findIndicatorDefinition,
  indicatorCatalog,
} from '../controllers/indicatorCatalog/index.js'
export type {
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
  InstrumentType,
  KLineAdjustment,
  KLinePeriod,
  LiveBar,
  LiveFrame,
  LiveQuote,
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
  RealtimeChannel,
  RealtimeConnection,
  RealtimeConnectionFactory,
  RealtimeConnectionRequest,
  RealtimeStatus,
  RealtimeSubscription,
  RealtimeSubscriptionPool,
  RealtimeSubscriptionRequest,
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
  baostockMarketDataProvider,
  binanceMarketDataProvider,
  createMockDataSource,
  createRealtimeSubscriptionPool,
  DataBuffer,
  DepthConnector,
  dataSourceRegistry,
  EUROPE_TRADITIONAL_BAR_AGGREGATION,
  gotdxMarketDataProvider,
  MarketDataProviderRegistry,
  marketDataProviderRegistry,
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
  LegendAnchorRect,
  LegendApi,
  LegendComparisonRow,
  LegendCurrentBar,
  LegendEntry,
  LegendIndicatorRow,
  LegendLayout,
  LegendMoveRequest,
  LegendOptions,
  LegendPatch,
  LegendRow,
  LegendRowText,
  LegendTemplateContext,
  LegendText,
  LegendTimeshareRow,
  LegendUiEventDetail,
  LegendUiRequest,
} from '../engine/legend/types.js'
export { LEGEND_UI_EVENT } from '../engine/legend/types.js'
// Indicator types & config
export type { SubIndicatorType } from '../engine/renderers/Indicator/index.js'
export { getPhysicalKLineConfig } from '../engine/viewport/klineConfig.js'
// Utility functions
export { kGapFromKWidth, zoomLevelToKWidth } from '../engine/viewport/zoom.js'
