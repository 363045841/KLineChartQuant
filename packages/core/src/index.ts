export * from './foundation/reactivity'
export * from './controllers'
export * from './features/mcp'
export { VERSION } from './version'
export * from './foundation/tokens'
export { formatTimestamp } from './foundation/utils/dateFormat'
export { generateUUID } from './foundation/utils/uuid'
export type { ChartSettings } from './foundation/config/chartSettings'

// ── Batch 1: Error taxonomy ───────────────────────────────────────────────
export {
  KLineChartError,
  isKLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
} from './errors'
export { getRecoveryHint, formatKLineChartError, type FormatErrorOptions } from './errors-help'

// ── Batch 2: Framework-agnostic foundation ────────────────────────────────
export * from './features/input'
export * from './scale'
export * from './rendering/scheduler'
export type * from './rendering/render'
export * from './rendering/renderer-tier'

// ── Batch 3: Scene abstraction (depends on render) ────────────────────────
export * from './rendering/scene'

// ── Batch 4: Independent business features ────────────────────────────────
export * from './features/alerts'
export * from './features/replay'
export * from './features/chartTypes'
export * from './features/indicators'

// ── Batch 5: Component data models ────────────────────────────────────────
export * from './components/volumeProfile'
export * from './components/orderBookHeatmap'
export * from './components/footprint'
export * from './components/anchoredVwap'
export * from './components/mtfOverlay'
export * from './components/crosshairSync'
