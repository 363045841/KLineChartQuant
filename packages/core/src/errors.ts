/**
 * KLineChartError — shared error taxonomy for `@klinechart-quant/*`.
 *
 * API audit BLOCKER-005 reported 53/54 throws were plain `Error`, 1
 * `RangeError`, and 2 one-off custom classes with no shared base. This
 * file is the harmonisation point: every recoverable failure across all
 * five publishable packages should be a `KLineChartError` carrying a
 * stable `code` from {@link KLineChartErrorCode}.
 *
 * Design:
 *   - Extends `Error` directly (no abstract layer) so it Just Works under
 *     V8 stack traces, async/await, and `Error.captureStackTrace`.
 *   - `code` is a string enum (not a literal union) so end-user code can
 *     branch on it without importing the enum object.
 *   - `cause` mirrors the ES2022 `Error.cause` field so wrapping a lower-
 *     level failure preserves the chain.
 *   - `instanceof KLineChartError` works across the package boundary
 *     because every publishable package imports this same module.
 *
 * Migration policy: each existing `throw new Error('msg')` becomes
 * `throw new KLineChartError('CODE', 'msg', { cause? })`. We do NOT rename
 * `RangeError` throws or browser/Node built-in errors raised by lower
 * layers — those keep their native type but downstream catch blocks
 * `instanceof KLineChartError` distinguish "expected/recoverable" from
 * "platform/unexpected".
 */

/**
 * Stable error code surface. New codes append-only — never remove or
 * renumber. Downstream code branches on these strings.
 *
 * Naming convention: SCREAMING_SNAKE_CASE, domain-prefixed where useful
 * (`SCALE_`, `FOOTPRINT_`, etc.) to disambiguate similar shapes across
 * controllers.
 */
export type KLineChartErrorCode =
  // generic
  | 'INVALID_PARAM'
  | 'INVALID_STATE'
  | 'DISPOSED'
  | 'NOT_REGISTERED'
  // scale (TimeScale / PriceScale construction + setters)
  | 'SCALE_RANGE_INVALID'
  | 'SCALE_HEIGHT_INVALID'
  | 'SCALE_LOG_REQUIRES_POSITIVE'
  | 'SCALE_BAR_WIDTH_INVALID'
  // footprint
  | 'FOOTPRINT_TICKSIZE_INVALID'
  | 'FOOTPRINT_BAR_INTERVAL_INVALID'
  | 'FOOTPRINT_RATIO_INVALID'
  // anchoredVwap
  | 'AVWAP_ANCHOR_OUT_OF_RANGE'
  // indicators (shared — every indicator validates inputs the same way)
  | 'INDICATOR_INVALID_PARAM'
  // orderBookHeatmap (controller + logColorScale + state + snapshotRing)
  | 'HEATMAP_CONFIG_INVALID'
  // mtfOverlay (alignToBaseIndex + resampleBars + createMtfController)
  | 'MTF_CONFIG_INVALID'
  // alternative chart types (renko / rangeBars / pointAndFigure)
  | 'CHART_TYPE_CONFIG_INVALID'
  // replay controller
  | 'REPLAY_CONFIG_INVALID'
  // scene / chart-controller / framework adapter wiring
  | 'CONTROLLER_CONFIG_INVALID'
  // data-fetcher (gotdx / baostock / tradingview)
  | 'FETCH_FAILED'
  // 数据源明确不支持请求能力，可由行情流转层处理
  | 'UNSUPPORTED_CAPABILITY'
  // 数据源明确不存在请求品种，可由行情流转层处理
  | 'INSTRUMENT_NOT_FOUND'
  // fetch aborted via AbortSignal (cancelation, not a failure)
  | 'FETCH_ABORTED'
  // depth/SSE source
  | 'DEPTH_SOURCE_ERROR'
  // serialization
  | 'SCHEMA_VERSION_MISMATCH'
  | 'INVALID_JSON'
  | 'NOT_OBJECT'
  | 'INVALID_TIMESTAMP'
  | 'MISSING_CONTROLLERS'

export interface KLineChartErrorOptions {
  /** Lower-level error this wraps (preserved as the standard `.cause`). */
  cause?: unknown
}

/**
 * Base error for everything thrown by `@klinechart-quant/*` that's
 * expected as part of the API contract.
 *
 * Always pass a `code` from {@link KLineChartErrorCode}; the message is
 * the human-readable explanation.
 */
export class KLineChartError extends Error {
  readonly code: KLineChartErrorCode
  // 显式声明下层错误引用，ES2022 标准 Error.cause 的稳定访问入口
  // declare 仅作类型声明，避免 useDefineForClassFields 把 cause 覆盖为 undefined
  declare readonly cause?: unknown

  constructor(code: KLineChartErrorCode, message: string, opts?: KLineChartErrorOptions) {
    // Forward `cause` via the ES2022 Error options bag when available.
    if (opts?.cause !== undefined) {
      super(message, { cause: opts.cause })
    } else {
      super(message)
    }
    this.code = code
    // `name` defaults to the constructor name in V8; pinning it makes
    // serialized errors (e.g. via JSON.stringify) carry the type tag.
    this.name = 'KLineChartError'
    // Capture stack at the throw site, not inside the constructor.
    // V8-specific but harmless elsewhere.
    if (
      typeof (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace === 'function'
    ) {
      ;(
        Error as unknown as { captureStackTrace: (e: Error, c: unknown) => void }
      ).captureStackTrace(this, KLineChartError)
    }
  }
}

/**
 * Convenience type-guard that doubles as a `code`-narrower:
 *
 *   try { ... } catch (e) {
 *     if (isKLineChartError(e, 'DISPOSED')) {
 *       // e.code is narrowed to 'DISPOSED'
 *     }
 *   }
 */
export function isKLineChartError(value: unknown): value is KLineChartError
export function isKLineChartError<C extends KLineChartErrorCode>(
  value: unknown,
  code: C,
): value is KLineChartError & { code: C }
export function isKLineChartError(value: unknown, code?: KLineChartErrorCode): boolean {
  if (!(value instanceof KLineChartError)) return false
  return code === undefined || value.code === code
}

// 数据获取错误码具名常量，供协议与流转层引用，避免散落字符串字面量。
export const ERROR_CODES: Readonly<Record<FetchErrorCodeName, KLineChartErrorCode>> = {
  FETCH_FAILED: 'FETCH_FAILED',
  FETCH_ABORTED: 'FETCH_ABORTED',
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  INSTRUMENT_NOT_FOUND: 'INSTRUMENT_NOT_FOUND',
}

// ERROR_CODES 的键名集合，保证键与值一一对应。
type FetchErrorCodeName =
  'FETCH_FAILED' | 'FETCH_ABORTED' | 'UNSUPPORTED_CAPABILITY' | 'INSTRUMENT_NOT_FOUND'

// 副图/渲染器投影错误码具名常量，供引擎层引用，避免散落字符串字面量。
export const SUBPANE_ERROR_CODES: Readonly<Record<SubPaneErrorCodeName, KLineChartErrorCode>> = {
  UNKNOWN_INDICATOR: 'NOT_REGISTERED',
  MISSING_RENDERER_METADATA: 'INVALID_PARAM',
}

// SUBPANE_ERROR_CODES 的键名集合，保证键与值一一对应。
type SubPaneErrorCodeName = 'UNKNOWN_INDICATOR' | 'MISSING_RENDERER_METADATA'

/** 便捷构造器：按错误码抛出统一错误。 */
export function createMarketDataError(
  code: KLineChartErrorCode,
  message: string,
  opts?: KLineChartErrorOptions,
): KLineChartError {
  return new KLineChartError(code, message, opts)
}

/** 便捷构造器：品种缺失交易时段。 */
export function createMissingSessionError(sourceId: string, instrumentId: string): KLineChartError {
  return createMarketDataError(
    ERROR_CODES.UNSUPPORTED_CAPABILITY,
    `[${sourceId}] sessionId is required for instrument ${instrumentId}`,
  )
}
