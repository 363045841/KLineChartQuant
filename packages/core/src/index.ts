export * from './components/anchoredVwap/index.js'
export * from './components/crosshairSync/index.js'
export * from './components/footprint/index.js'
export * from './components/mtfOverlay/index.js'
export * from './components/orderBookHeatmap/index.js'
// ── Batch 5: Component data models ────────────────────────────────────────
export * from './components/volumeProfile/index.js'
export * from './controllers/index.js'
export type { BuiltinIndicatorName, IndicatorName } from './engine/indicators/indicatorContracts.js'
export {
  Indicator,
  type IndicatorDefinitionConfig,
} from './engine/indicators/indicatorDefinitionRegistry.js'
export {
  IndicatorKind,
  type IndicatorMetadata,
  type IndicatorRendererOptions,
  type IndicatorRuntimeDescriptor,
  type IndicatorScaleRendererOptions,
  type RendererFactory,
} from './engine/indicators/indicatorMetadata.js'
// ── Batch 1: Error taxonomy ───────────────────────────────────────────────
export {
  createMarketDataError,
  createMissingSessionError,
  isKLineChartError,
  KLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
} from './errors.js'
export { type FormatErrorOptions, formatKLineChartError, getRecoveryHint } from './errors-help.js'
export * from './features/agent/index.js'
// ── Batch 4: Independent business features ────────────────────────────────
export * from './features/alerts/index.js'
export * from './features/chartTypes/index.js'
export * from './features/indicators/index.js'
// ── Batch 2: Framework-agnostic foundation ────────────────────────────────
export * from './features/input/index.js'
export * from './features/replay/index.js'
export {
  type ChartToolConfig,
  type ChartToolExecutionContext,
  type ChartToolSafety,
  getRegisteredChartTools,
  type RegisteredChartTool,
  registerChartTool,
  Tool,
  unregisterChartTool,
} from './foundation/agent/chartToolRegistry.js'
export type { ChartSettings } from './foundation/config/chartSettings.js'
export * from './foundation/config/marketSession/marketSessionRegistry.js'
export * from './foundation/config/marketSession/resolveSymbolMarketSession.js'
export * from './foundation/persistence/index.js'
export { makePluginLayerId } from './foundation/plugin/impl/rendererLayerId.js'
export type { Plugin, PluginConfig, PluginHost, RenderContext } from './foundation/plugin/types.js'
export * from './foundation/reactivity/index.js'
export * from './foundation/tokens/index.js'
export { formatDateTimeInTimeZone, formatTimeInTimeZone } from './foundation/utils/dateFormat.js'
export * from './foundation/utils/rendererCapability.js'
export type { MarketSessionConfig, OpenTimeRange } from './foundation/utils/sessionTimeLabels.js'
export { generateUUID } from './foundation/utils/uuid.js'
export type * from './rendering/render/index.js'
// ── Batch 3: Scene abstraction (depends on render) ────────────────────────
export * from './rendering/scene/index.js'
export * from './scale/index.js'
export { VERSION } from './version.js'
