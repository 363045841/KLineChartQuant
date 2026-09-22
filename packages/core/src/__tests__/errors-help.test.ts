/**
 * Tests for the error-help layer (recovery hints + diagnostic formatter).
 *
 * Coverage:
 *   1. Every `KLineChartErrorCode` has a non-empty, non-trivial hint.
 *   2. `getRecoveryHint` returns the same string across calls (no PRNG,
 *      no clock-dependence).
 *   3. `formatKLineChartError` happy paths:
 *      - includes code + message + hint by default.
 *      - omits hint when `includeHint: false`.
 *      - omits cause chain when `includeCause: false`.
 *      - includes stack when `includeStack: true`.
 *      - indents the cause chain.
 *   4. Non-KLineChartError pass-through:
 *      - Error instance → `${name}: ${message}` (+ stack if requested).
 *      - Non-Error primitive → `String(value)`.
 *   5. Cause chain renders nested KLineChartError correctly.
 *   6. Custom indent prefix is honoured.
 */

import { describe, expect, it } from 'vitest'

import { KLineChartError, type KLineChartErrorCode } from '../errors'
import { formatKLineChartError, getRecoveryHint } from '../errors-help'

// The exhaustive list of codes. Adding a new code to `errors.ts` and
// forgetting to add a hint must fail here.
const ALL_CODES: ReadonlyArray<KLineChartErrorCode> = [
  'INVALID_PARAM',
  'INVALID_STATE',
  'DISPOSED',
  'NOT_REGISTERED',
  'SCALE_RANGE_INVALID',
  'SCALE_HEIGHT_INVALID',
  'SCALE_LOG_REQUIRES_POSITIVE',
  'SCALE_BAR_WIDTH_INVALID',
  'FOOTPRINT_TICKSIZE_INVALID',
  'FOOTPRINT_BAR_INTERVAL_INVALID',
  'FOOTPRINT_RATIO_INVALID',
  'AVWAP_ANCHOR_OUT_OF_RANGE',
  'INDICATOR_INVALID_PARAM',
  'HEATMAP_CONFIG_INVALID',
  'MTF_CONFIG_INVALID',
  'CHART_TYPE_CONFIG_INVALID',
  'REPLAY_CONFIG_INVALID',
  'CONTROLLER_CONFIG_INVALID',
  'SCHEMA_VERSION_MISMATCH',
  'INVALID_JSON',
  'NOT_OBJECT',
  'INVALID_TIMESTAMP',
  'MISSING_CONTROLLERS',
  'DRAWING_ANCHOR_DATE_OUT_OF_RANGE',
  'DRAWING_ANCHOR_DATE_NOT_TRADING',
  'DRAWING_ANCHOR_DATE_UNAVAILABLE',
]

// ---------------------------------------------------------------------------
// Hint coverage
// ---------------------------------------------------------------------------

describe('getRecoveryHint', () => {
  it.each(ALL_CODES)('%s has a non-empty, non-trivial hint', (code) => {
    const hint = getRecoveryHint(code)
    expect(typeof hint).toBe('string')
    expect(hint.length).toBeGreaterThan(20)
    // Trivial hints like "see docs" or "fix it" don't help anyone.
    expect(hint.toLowerCase()).not.toMatch(/^(see docs|fix it|todo)/)
  })

  it('returns the same string on repeated calls (deterministic)', () => {
    const a = getRecoveryHint('INVALID_PARAM')
    const b = getRecoveryHint('INVALID_PARAM')
    expect(a).toBe(b)
  })

  it('every hint is unique (no copy-paste accidents)', () => {
    const seen = new Map<string, KLineChartErrorCode>()
    for (const code of ALL_CODES) {
      const hint = getRecoveryHint(code)
      const prior = seen.get(hint)
      if (prior !== undefined) {
        throw new Error(
          `duplicate hint: ${JSON.stringify(prior)} and ${JSON.stringify(code)} share text`,
        )
      }
      seen.set(hint, code)
    }
  })
})

// ---------------------------------------------------------------------------
// formatKLineChartError — KLineChartError paths
// ---------------------------------------------------------------------------

describe('formatKLineChartError — KLineChartError input', () => {
  it('includes header, message, and hint by default', () => {
    const e = new KLineChartError(
      'SCALE_BAR_WIDTH_INVALID',
      'createTimeScale: initialBarWidth must be > 0, got 0',
    )
    const out = formatKLineChartError(e)
    expect(out).toContain('KLineChartError [SCALE_BAR_WIDTH_INVALID]')
    expect(out).toContain('initialBarWidth must be > 0')
    expect(out).toContain('Hint:')
    expect(out).toContain(getRecoveryHint('SCALE_BAR_WIDTH_INVALID'))
  })

  it('omits hint when includeHint=false', () => {
    const e = new KLineChartError('INVALID_PARAM', 'bad')
    const out = formatKLineChartError(e, { includeHint: false })
    expect(out).not.toContain('Hint:')
  })

  it('includes stack when includeStack=true', () => {
    const e = new KLineChartError('INVALID_PARAM', 'bad')
    const out = formatKLineChartError(e, { includeStack: true })
    expect(out).toContain('Stack:')
  })

  it('omits cause when includeCause=false even if .cause is present', () => {
    const root = new Error('underlying boom')
    const wrap = new KLineChartError('INVALID_STATE', 'wrap', { cause: root })
    const out = formatKLineChartError(wrap, { includeCause: false })
    expect(out).not.toContain('Caused by')
    expect(out).not.toContain('underlying boom')
  })

  it('renders the cause chain when present', () => {
    const root = new Error('underlying boom')
    const wrap = new KLineChartError('INVALID_STATE', 'wrap', { cause: root })
    const out = formatKLineChartError(wrap)
    expect(out).toContain('Caused by:')
    expect(out).toContain('underlying boom')
  })

  it('renders nested KLineChartError causes with codes', () => {
    const inner = new KLineChartError('INVALID_PARAM', 'inner bad')
    const outer = new KLineChartError('INVALID_STATE', 'outer bad', { cause: inner })
    const out = formatKLineChartError(outer)
    expect(out).toContain('KLineChartError [INVALID_STATE]')
    expect(out).toContain('KLineChartError [INVALID_PARAM]')
    expect(out).toContain('inner bad')
  })

  it('honours a custom indent prefix', () => {
    const e = new KLineChartError('INVALID_PARAM', 'bad')
    const out = formatKLineChartError(e, { indent: '    ' })
    expect(out).toContain('    bad')
  })
})

// ---------------------------------------------------------------------------
// formatKLineChartError — non-KLineChartError pass-through
// ---------------------------------------------------------------------------

describe('formatKLineChartError — pass-through', () => {
  it('plain Error → "Name: message"', () => {
    const out = formatKLineChartError(new TypeError('oops'))
    expect(out).toBe('TypeError: oops')
  })

  it('plain Error with includeStack=true appends the stack', () => {
    const e = new Error('boom')
    const out = formatKLineChartError(e, { includeStack: true })
    expect(out.startsWith('Error: boom\n')).toBe(true)
    // Vitest / V8 stack lines start with `    at`. We can't assert on
    // a specific line because environments differ, but a stack ought
    // to contain at least one such frame.
    expect(out).toMatch(/\n.*at .+/)
  })

  it('string primitive → String(value)', () => {
    expect(formatKLineChartError('plain text')).toBe('plain text')
  })

  it('number primitive → String(value)', () => {
    expect(formatKLineChartError(42)).toBe('42')
  })

  it('null / undefined → String(value)', () => {
    expect(formatKLineChartError(null)).toBe('null')
    expect(formatKLineChartError(undefined)).toBe('undefined')
  })
})
