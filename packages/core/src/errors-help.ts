/**
 * Error recovery hints + diagnostic formatter.
 *
 * The companion to `errors.ts`: that file defines the contract
 * ({@link KLineChartError} + {@link KLineChartErrorCode}); this file
 * makes each thrown error *useful at the point of catch*.
 *
 * What hosts get:
 *
 *   - `getRecoveryHint(code)` — a 1–2 sentence "what to do next"
 *     keyed by error code. Suitable for displaying inline in a dev
 *     overlay, terminal log, or React error boundary.
 *   - `formatKLineChartError(err)` — multi-line diagnostic that
 *     combines the code, the original message, the recovery hint,
 *     and the cause chain (ES2022 `Error.cause`). The output is
 *     plain text — no ANSI, no Markdown — so it composes with
 *     whatever rendering layer the host chooses.
 *
 * Why this isn't in `errors.ts`: the recovery hints are user-facing
 * copy. Keeping them separate means the message taxonomy stays
 * focused (it's the contract), while the help text can evolve
 * without churning the contract file.
 *
 * Why hints are bundled (not lazy-loaded from a CDN, à la React):
 * @klinechart-quant ships to environments without network
 * (kiosk dashboards, isolated trading workstations, Electron apps).
 * The hint text adds ~2 KB; that's the cheapest possible "useful
 * error" we can ship.
 */

import type { KLineChartError, KLineChartErrorCode } from './errors'
import { isKLineChartError } from './errors'

// ---------------------------------------------------------------------------
// Recovery hints — keyed by KLineChartErrorCode
// ---------------------------------------------------------------------------

/**
 * Note for maintainers: every code in `KLineChartErrorCode` MUST have an
 * entry here. The "every code has a hint" test enforces this — adding a
 * code without a hint fails CI.
 */
const HINTS: Readonly<Record<KLineChartErrorCode, string>> = {
  // Generic
  INVALID_PARAM:
    'Check the argument values against the documented contract. If a finite number is expected, NaN / Infinity are rejected; if a positive value is expected, zero and negatives are rejected.',
  INVALID_STATE:
    'The operation is incompatible with the current controller state. Read the relevant state signal (e.g. `position`, `mode`) before retrying.',
  DISPOSED:
    'This controller was disposed and silently no-ops on further mutations. Create a new instance — disposal is one-way.',
  NOT_REGISTERED:
    'The id was not registered with this controller. Call register() / setBaseBars() / equivalent before the operation that needs it.',

  // Scale (TimeScale + PriceScale)
  SCALE_RANGE_INVALID:
    'visibleMax must be >= visibleMin and both must be finite. Verify any computed range (e.g. autoFit) is well-formed before passing it in.',
  SCALE_HEIGHT_INVALID:
    'height must be > 0. After a host resize, re-check the container has a non-zero rect before updating the scale.',
  SCALE_LOG_REQUIRES_POSITIVE:
    "Log-mode price scales require strictly positive bounds. Either clamp the range to (0, +∞) or switch the scale's mode to 'linear' before assigning a range that includes <= 0.",
  SCALE_BAR_WIDTH_INVALID:
    'barWidth must be > 0. Zoom helpers should clamp the result above a floor (e.g. 0.5 px) before calling setBarWidth.',

  // Footprint controller
  FOOTPRINT_TICKSIZE_INVALID:
    'FootprintController tickSize must be > 0 (the quantization unit for the price ladder).',
  FOOTPRINT_BAR_INTERVAL_INVALID:
    'FootprintController barIntervalMs must be a positive finite number — the ms-per-bar bucket width.',
  FOOTPRINT_RATIO_INVALID:
    'FootprintController imbalanceRatio must be > 0 — the ask:bid ratio threshold for the diagonal imbalance flag.',

  // Anchored VWAP
  AVWAP_ANCHOR_OUT_OF_RANGE:
    'anchorIndex must satisfy 0 <= idx < bars.length. Pass an empty bars[] to short-circuit if you have no data yet.',

  // Indicators (shared)
  INDICATOR_INVALID_PARAM:
    'Indicator input validation failed. Common causes: period < 2, sigma <= 0, offset outside [0, 1]. See the indicator function header for its exact ranges.',

  // Order Book Heatmap (shared across subsystems)
  HEATMAP_CONFIG_INVALID:
    'Order book heatmap config check failed. Most likely culprit: tickSize, snapshotIntervalMs, snapshotRingCapacity, or logColorRange bounds out of range. The error message names the failing field.',

  // MTF Overlay
  MTF_CONFIG_INVALID:
    'Multi-timeframe overlay config check failed. Likely targetIntervalMs <= 0, base/target interval mismatch, or a duplicate series id. The error message names the failing field.',

  // Alternative chart types
  CHART_TYPE_CONFIG_INVALID:
    'Alternative chart-type config check failed. Renko needs brickSize > 0 (or useATR.period >= 1); Range Bars needs range > 0; Point & Figure needs boxSize > 0 and reversal >= 1.',

  // Replay
  REPLAY_CONFIG_INVALID:
    'Replay config check failed. Range needs finite start/end with end >= start; speed must be a positive finite number (reverse playback is rejected in v1).',

  // Controller wiring
  CONTROLLER_CONFIG_INVALID:
    'Chart controller wiring is incomplete. Most often: container is null/undefined, opts is missing, or no ChartControllerFactory was registered via __setChartFactory before mount.',

  // Data-fetcher
  FETCH_FAILED:
    'A remote data-fetch failed. Check network connectivity, API endpoint, and authentication tokens. If using baostock/tradingview provider, verify the symbol and period are valid.',
  DEPTH_SOURCE_ERROR:
    'The depth/SSE data source encountered an error. Verify the Go backend SSE endpoint is reachable and the symbol is valid. EventSource will auto-reconnect.',

  // Serialization
  SCHEMA_VERSION_MISMATCH:
    'The serialized state was produced by a different schema version. Migrate it via the schema-version converter, or re-export from the source session.',
  INVALID_JSON:
    'The state string was not valid JSON. If it came from a textarea, check for accidental BOM, smart quotes, or trailing commas.',
  NOT_OBJECT:
    'A SerializedChartState root must be a JSON object. Arrays and primitives are rejected.',
  INVALID_TIMESTAMP:
    'snapshotTakenAt must be an ISO 8601 string parseable by Date.parse. Format it via new Date().toISOString() on the producing side.',
  MISSING_CONTROLLERS:
    'A SerializedChartState requires a controllers object. If you intentionally have no controllers, pass an empty object {}.',
}

/**
 * Returns the recovery hint for an error code. Always non-empty; if a new
 * code lands without an entry, the bundled test fails at CI.
 */
export function getRecoveryHint(code: KLineChartErrorCode): string {
  return HINTS[code]
}

// ---------------------------------------------------------------------------
// formatKLineChartError — dev-overlay-ready diagnostic
// ---------------------------------------------------------------------------

export interface FormatErrorOptions {
  /**
   * Include the recovery hint line. Default true. Set false when the
   * host renders the hint separately (e.g. a foldable section).
   */
  readonly includeHint?: boolean
  /**
   * Include the `.cause` chain (ES2022). Default true. When false the
   * output is single-error.
   */
  readonly includeCause?: boolean
  /**
   * Include the stack trace. Default false — stacks are noisy and most
   * dev overlays render them separately. Set true for log output.
   */
  readonly includeStack?: boolean
  /**
   * Indent prefix for cause-chain lines. Default `'  '` (two spaces).
   */
  readonly indent?: string
}

const DEFAULTS: Required<FormatErrorOptions> = {
  includeHint: true,
  includeCause: true,
  includeStack: false,
  indent: '  ',
}

/**
 * Format a KLineChartError (or any value caught in a try / catch) into
 * a plain-text multi-line diagnostic ready for a dev overlay, console,
 * or test failure message.
 *
 * Example output:
 *
 *   KLineChartError [SCALE_BAR_WIDTH_INVALID]
 *     createTimeScale: initialBarWidth must be > 0, got 0
 *     Hint: barWidth must be > 0. Zoom helpers should clamp the result above a floor (e.g. 0.5 px) before calling setBarWidth.
 *
 * For non-KLineChartError input the output is one line — the value's
 * own `toString()` or `String(value)`.
 */
export function formatKLineChartError(err: unknown, opts?: FormatErrorOptions): string {
  const cfg = { ...DEFAULTS, ...(opts ?? {}) }
  if (!isKLineChartError(err)) {
    // Pass-through for unknown errors so callers can use this
    // unconditionally and still get readable output.
    if (err instanceof Error) {
      const head = `${err.name}: ${err.message}`
      if (!cfg.includeStack || typeof err.stack !== 'string') return head
      return `${head}\n${err.stack}`
    }
    return String(err)
  }
  const lines: string[] = []
  lines.push(`KLineChartError [${err.code}]`)
  lines.push(`${cfg.indent}${err.message}`)
  if (cfg.includeHint) {
    lines.push(`${cfg.indent}Hint: ${getRecoveryHint(err.code)}`)
  }
  if (cfg.includeCause && hasCause(err)) {
    const cause = (err as KLineChartError & { cause?: unknown }).cause
    lines.push(`${cfg.indent}Caused by:`)
    const child = formatKLineChartError(cause, {
      ...cfg,
      indent: cfg.indent + cfg.indent,
    })
    // Indent every line of the child.
    for (const ln of child.split('\n')) {
      lines.push(`${cfg.indent}${ln}`)
    }
  }
  if (cfg.includeStack && typeof err.stack === 'string') {
    lines.push(`${cfg.indent}Stack:`)
    for (const ln of err.stack.split('\n')) {
      lines.push(`${cfg.indent}${cfg.indent}${ln}`)
    }
  }
  return lines.join('\n')
}

function hasCause(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const cause = (err as { cause?: unknown }).cause
  return cause !== undefined && cause !== null
}
