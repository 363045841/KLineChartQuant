export * from './reactivity'
export * from './controllers'
export * from './mcp'
export { VERSION } from './version'
export * from './tokens'
export { formatTimestamp } from './utils/dateFormat'
export { generateUUID } from './utils/uuid'
export type { ChartSettings } from './config/chartSettings'

// ── Batch 1: Error taxonomy ───────────────────────────────────────────────
export {
  KLineChartError,
  isKLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
} from './errors'
export { getRecoveryHint, formatKLineChartError, type FormatErrorOptions } from './errors-help'

// ── Batch 2: Framework-agnostic foundation ────────────────────────────────
export * from './input'
export * from './scale'
export * from './scheduler'
export type * from './render'
export * from './renderer-tier'

// ── Batch 3: Scene abstraction (depends on render) ────────────────────────
export * from './scene'

// ── Batch 4: Independent business features ────────────────────────────────
export * from './alerts'
export * from './replay'
export * from './chartTypes'
export * from './indicators'

// ── Batch 5: Component data models ────────────────────────────────────────
export * from './components/volumeProfile'
export * from './components/orderBookHeatmap'
export * from './components/footprint'
export * from './components/anchoredVwap'
export * from './components/mtfOverlay'
export * from './components/crosshairSync'
