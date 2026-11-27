export * from './components/anchoredVwap/index.js'
export * from './components/crosshairSync/index.js'
export * from './components/footprint/index.js'
export * from './components/mtfOverlay/index.js'
export * from './components/orderBookHeatmap/index.js'
// ── Batch 5: Component data models ────────────────────────────────────────
export * from './components/volumeProfile/index.js'
export * from './controllers/index.js'
export { createIndicatorLayerId } from './engine/indicators/indicatorLayerNaming.js'
export {
  type IndicatorInputDisplay,
  type IndicatorMetadata,
  type IndicatorRuntimeDescriptor,
} from './engine/indicators/indicatorMetadata.js'
export {
  type GetTitleInfoFn,
  type IndicatorRendererOptions,
  type RenderableIndicator,
  type RendererFactory,
} from './engine/renderers/Indicator/types.js'
export { bindPlotRendering } from './engine/renderers/Indicator/plotBinding.js'
export {
  createPlotIndicatorDefinition,
  type IndicatorCandidate,
  type IndicatorCatalogCommit,
  type IndicatorCollector,
  type IndicatorCompiler,
  type IndicatorDefinitionLoader,
  type IndicatorDescriptor,
  type IndicatorDocumentIdentity,
  type IndicatorFailure,
  type IndicatorOrigin,
  type IndicatorPipelineReport,
  type IndicatorStage,
  logIndicatorFailure,
  type RegistrableIndicator,
  runIndicatorPipeline,
  type StageResult,
} from './engine/indicators/pipeline/index.js'
export {
  createDefinitionRegistry,
  type DefinitionRegistry,
} from './engine/indicators/registry/index.js'
export {
  createMarketRuntime,
  type MarketRuntime,
  type MarketRuntimeOptions,
} from './engine/runtime/index.js'
// ── Batch 2: Framework-agnostic foundation ────────────────────────────────
export * from './engine/legend/index.js'
export type * from './engine/objects/index.js'
export type { ObjectAxesApi } from './engine/pane/axisTypes.js'
// 外部来源注册"产出 Plot 的指标"时，用该工厂绑定通用 Plot Layer。
export { plotRenderer as createPlotIndicatorRenderer } from './engine/plots/impl/plotDefinition.js'
export type {
  ArrowPlot,
  CharPlot,
  IndicatorPlotDefinition,
  IndicatorSeries,
  Plot,
  PlotFill,
  PlotPoint,
  PlotRenderState,
  ShapePlot,
} from './engine/plots/types.js'
export { PlotKind, ShapeLocation, ShapeSize, ShapeStyle } from './engine/plots/types.js'
// 主价格轴身份是 UI 与引擎共用的 SSOT：宿主据此区分价格轴与指标轴。
export { PRICE_SERIES_AXIS_ID } from './engine/renderers/rendererIds.js'
// ── Batch 1: Error taxonomy ───────────────────────────────────────────────
export {
  createMarketDataError,
  createMissingSessionError,
  ERROR_CODES,
  isKLineChartError,
  KLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
  MARKET_QUERY_ERROR_CODES,
} from './errors.js'
export { type FormatErrorOptions, formatKLineChartError, getRecoveryHint } from './errors-help.js'
export * from './features/agent/index.js'
// ── Batch 4: Independent business features ────────────────────────────────
export * from './engine/calculation/index.js'
export * from './features/alerts/index.js'
export * from './features/input/index.js'
export type { SymbolSpec } from './foundation/types/instrument.js'
export type { ChartSettings } from './foundation/config/chartSettings.js'
export * from './foundation/config/marketSession/marketSessionRegistry.js'
export * from './foundation/config/marketSession/resolveSymbolMarketSession.js'
export type { ObjectAxisBinding } from './foundation/geometry/axisBinding.js'
export { objectAxisId } from './foundation/geometry/axisBinding.js'
export type { FrameCoordinates } from './foundation/geometry/frameCoordinates.js'
export * from './foundation/persistence/index.js'
export { makePluginLayerId } from './foundation/plugin/impl/rendererLayerId.js'
export type { Plugin, PluginConfig, PluginHost, RenderContext } from './foundation/plugin/types.js'
export * from './foundation/reactivity/index.js'
export * from './foundation/time/index.js'
export * from './foundation/tokens/index.js'
export * from './foundation/utils/rendererCapability.js'
export {
  createMarketDataService,
  resolveBarsSelection,
  type BarsOptions,
  type BarsPage,
  type BarsPageRequest,
  type BarsSeries,
  type MarketDataService,
  type TimeShareOptions,
  type TradesSeries,
} from './data/service/index.js'
export type { MarketSessionConfig, OpenTimeRange } from './foundation/utils/sessionTimeLabels.js'
export { generateUUID } from './foundation/utils/uuid.js'
export { systemClock, type Clock } from './foundation/utils/clock.js'
export type * from './rendering/render/index.js'
// ── Batch 3: Scene abstraction (depends on render) ────────────────────────
export * from './rendering/scene/index.js'
export * from './scale/index.js'
export { VERSION } from './version.js'
