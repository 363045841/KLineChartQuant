/**
 * Timeline — bar-index ↔ timestamp navigation.
 *
 * A `BarCalendar` is the authoritative list of bar open-times in
 * milliseconds. Real markets aren't uniformly spaced: there are weekend
 * gaps, half-day holiday closes, exchange maintenance windows, etc. The
 * timeline functions must honor those gaps exactly — bar N and bar N+1 can
 * be 60 seconds apart on a Tuesday and three days apart Friday→Monday.
 *
 * Both functions are pure and total: out-of-range inputs return `null`
 * instead of throwing. Callers (e.g. the replay controller, the crosshair
 * tooltip) should treat `null` as "no data at that position".
 */

/** A monotonically-increasing list of bar open timestamps (ms since epoch).
 *  By convention `calendar[i]` is the open time of bar `i`. */
export type BarCalendar = ReadonlyArray<number>

/**
 * Look up the timestamp for an integer bar index.
 *
 * Fractional `barIndex` is floored — the timestamp returned is the
 * open-time of the containing bar. (Callers that want intra-bar
 * interpolation should do it themselves.)
 *
 * Returns `null` if the calendar is empty or the index is out of range.
 */
export function barIndexToTimestamp(calendar: BarCalendar, barIndex: number): number | null {
  if (calendar.length === 0) return null
  if (!Number.isFinite(barIndex)) return null
  const idx = Math.floor(barIndex)
  if (idx < 0 || idx >= calendar.length) return null
  // We've bounds-checked the index, so this access is safe.
  return calendar[idx] as number
}

/**
 * Look up the bar index that contains a given timestamp.
 *
 * Uses binary search; cost is O(log n). The returned index is the bar
 * whose open-time is the largest value `<= ts`. This means a timestamp
 * that falls inside a non-trading gap (e.g. Saturday) resolves to the
 * last bar before the gap (Friday's close), which is the intuitive
 * behavior for "scrub to this wall-clock time".
 *
 * Returns `null` if the calendar is empty or `ts` precedes the first bar.
 */
export function timestampToBarIndex(calendar: BarCalendar, ts: number): number | null {
  if (calendar.length === 0) return null
  if (!Number.isFinite(ts)) return null
  const first = calendar[0] as number
  if (ts < first) return null
  const last = calendar[calendar.length - 1] as number
  if (ts >= last) return calendar.length - 1

  // Binary search for the largest index `i` such that calendar[i] <= ts.
  let lo = 0
  let hi = calendar.length - 1
  while (lo < hi) {
    // Bias the midpoint up so `lo` converges to the upper bound.
    const mid = (lo + hi + 1) >>> 1
    const v = calendar[mid] as number
    if (v <= ts) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}

/**
 * Compute the dominant bar interval (in ms) from a calendar.
 *
 * Uses the median delta between successive bars, which is robust to
 * weekend and holiday gaps that would skew a simple mean. Returns
 * `null` if the calendar has fewer than two bars.
 *
 * The replay controller uses this when `barIntervalMs` is not configured
 * but a calendar is available, so wall-clock pacing self-calibrates.
 */
export function inferBarIntervalMs(calendar: BarCalendar): number | null {
  if (calendar.length < 2) return null
  const deltas: number[] = []
  for (let i = 1; i < calendar.length; i++) {
    const a = calendar[i - 1] as number
    const b = calendar[i] as number
    const d = b - a
    if (d > 0) deltas.push(d)
  }
  if (deltas.length === 0) return null
  deltas.sort((a, b) => a - b)
  const mid = deltas.length >>> 1
  if (deltas.length % 2 === 1) {
    return deltas[mid] as number
  }
  const lo = deltas[mid - 1] as number
  const hi = deltas[mid] as number
  return (lo + hi) / 2
}
