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
