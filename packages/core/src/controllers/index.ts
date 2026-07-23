// -- Controller types (framework-agnostic) --
export type {
  KLineData,
  IndicatorPaneRole,
  IndicatorRole,
  IndicatorParamDef,
  IndicatorDefinition,
  IndicatorInstance,
  ActiveIndicator,
  SubPaneInfo,
  DrawingToolType,
  DrawingObject,
  InteractionSnapshot,
  DrawingControllerCallbacks,
  IndicatorSelectorController,
  ToolbarController,
  ToolDefinition,
  ToolId,
  DrawingState,
  DrawingController,
  ChartMountOptions,
  ChartViewport,
  ChartController,
  ChartControllerFactory,
  PaneSpec,
  DrawingChartAdapter,
  DrawingChartViewport,
  PaneLayoutInfo,
  SymbolSpec,
  SymbolInfo,
  DataSourceParams,
  DataFetcher,
  CustomDataSource,
} from './types'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
} from '../rendering/render/rendererHost'

export { createChartController } from './createChartController'
export { createIndicatorSelectorController } from './createIndicatorSelectorController'

// -- Engine sub-path re-exports (Phase 9: facade for Vue adapter) --

// Utility functions
export { zoomLevelToKWidth, kGapFromKWidth } from '../engine/utils/zoom'
export { getPhysicalKLineConfig } from '../engine/utils/klineConfig'

// Indicator types & config
export type { SubIndicatorType } from '../engine/renderers/Indicator'

// Main-pane legend template context (Vue #legend slot / external renderers)
export type {
  LegendTemplateContext,
  LegendRenderMode,
  LegendLayout,
  LegendCurrentBar,
  LegendTimeshareRow,
  LegendIndicatorRow,
  LegendComparisonRow,
} from '../engine/renderers/Indicator/mainIndicatorLegendContext'

// Indicator data helpers
export {
  allIndicators,
  findIndicator,
  isSubIndicatorId,
} from '../engine/renderers/Indicator/indicatorCatalog'
export type { Indicator } from '../engine/renderers/Indicator/indicatorCatalog'
export {
  loadBuiltinIndicators,
  isBuiltinIndicatorsLoaded,
} from '../engine/indicators/registerBuiltins'

// Data fetcher adapters
export {
  thousandMockDataFetcher,
  hundredMockDataFetcher,
  baostockDataFetcher,
  routerDataFetcher,
  routerSearchFetchers,
  DataBuffer,
  BinanceSSESource,
  DEFAULT_BINANCE_SSE_URL,
  DepthConnector,
} from '../data'
export type {
  DataWindow,
  DepthSource,
  DepthDelta,
  DepthSnapshot,
  DepthSourceStatus,
  SearchConfig,
  SearchResult,
} from '../data'

// Heatmap controller (depth pipeline rendering half)
export { createHeatmapController } from '../components/orderBookHeatmap'
export type {
  HeatmapController,
  HeatmapControllerConfig,
  HeatmapState,
  BookSnapshot,
  OrderBookDelta,
} from '../components/orderBookHeatmap'

// Drawing
export { DrawingInteractionController } from '../engine/drawing'
export type { DrawingToolId } from '../engine/drawing'
