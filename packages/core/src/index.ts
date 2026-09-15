export * from './components/anchoredVwap'
export * from './components/crosshairSync'
export * from './components/footprint'
export * from './components/mtfOverlay'
export * from './components/orderBookHeatmap'
// ── Batch 5: Component data models ────────────────────────────────────────
export * from './components/volumeProfile'
export * from './controllers'
export * from './engine/market/marketSessionRegistry'
export * from './engine/market/resolveSymbolMarketSession'
// ── Batch 1: Error taxonomy ───────────────────────────────────────────────
export {
  createMarketDataError,
  createMissingSessionError,
  isKLineChartError,
  KLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
} from './errors'
export { type FormatErrorOptions, formatKLineChartError, getRecoveryHint } from './errors-help'
export * from './features/agent'
// ── Batch 4: Independent business features ────────────────────────────────
export * from './features/alerts'
export * from './features/chartTypes'
export * from './features/indicators'
// ── Batch 2: Framework-agnostic foundation ────────────────────────────────
export * from './features/input'
export * from './features/replay'
export type { ChartSettings } from './foundation/config/chartSettings'
export * from './foundation/reactivity'
export * from './foundation/tokens'
export { formatTimestamp } from './foundation/utils/dateFormat'
export * from './foundation/utils/rendererCapability'
export type { MarketSessionConfig, OpenTimeRange } from './foundation/utils/sessionTimeLabels'
export { generateUUID } from './foundation/utils/uuid'
export type * from './rendering/render'
export * from './rendering/renderer-tier'
// ── Batch 3: Scene abstraction (depends on render) ────────────────────────
export * from './rendering/scene'
export * from './rendering/scheduler'
export * from './scale'
export { VERSION } from './version'
