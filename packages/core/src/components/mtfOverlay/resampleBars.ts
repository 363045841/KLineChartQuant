import { KLineChartError } from '../../errors.js'
/**
 * Resample a base-timeframe bar series to a higher timeframe.
 *
 * Two design choices worth pinning:
 *
 * 1. We bucket by **floor(timestamp / targetIntervalMs) * targetIntervalMs**,
 *    not by counting base bars. This is robust to gaps in the input — a
 *    1-minute series that skips 09:33 (the bar simply isn't there) will still
 *    correctly group 09:30..09:34 into one 5m bucket and produce no synthetic
 *    bar for 09:33.
 *
 * 2. The final bucket is allowed to be **partial** (contain fewer base bars
 *    than `targetIntervalMs / baseIntervalMs`). This is the right default for
 *    live charts: the forming bar must appear in the output so its EMA / RSI
 *    can be plotted. Callers that want "closed bars only" should drop the
 *    last element if `bucketEnd > lastBucketStart + targetIntervalMs - baseIntervalMs`
 *    (or equivalently, if `sourceEnd - sourceStart + 1 < bucketSize`).
 *
 * Aggregation rules:
 *   - timestamp = floor(firstBar.timestamp / targetIntervalMs) * targetIntervalMs
 *   - open  = firstBar.open
 *   - close = lastBar.close
 *   - high  = max over [start, end]
 *   - low   = min over [start, end]
 *   - volume = sum over [start, end]
 *   - sourceStart, sourceEnd = inclusive base-index range
 */

import type { BaseBar, ResampledBar } from './types.js'

/**
 * @internal — building block used by `createMtfController`. Reachable today
 *   via the top-level `@klinechart-quant/core` barrel but **NOT
 *   part of the supported public API**. typedoc / api-extractor
 *   hide it from generated docs. Prefer the controller factory
 *   for stable user code. Closes API audit BLOCKER-002.
 */
export function resampleBars(
  bars: ReadonlyArray<BaseBar>,
  baseIntervalMs: number,
  targetIntervalMs: number,
): ReadonlyArray<ResampledBar> {
  if (!Number.isFinite(baseIntervalMs) || baseIntervalMs <= 0) {
    throw new KLineChartError(
      'MTF_CONFIG_INVALID',
      'resampleBars: baseIntervalMs must be a positive finite number',
    )
  }
  if (!Number.isFinite(targetIntervalMs) || targetIntervalMs <= 0) {
    throw new KLineChartError(
      'MTF_CONFIG_INVALID',
      'resampleBars: targetIntervalMs must be a positive finite number',
    )
  }
  if (targetIntervalMs % baseIntervalMs !== 0) {
    throw new KLineChartError(
      'MTF_CONFIG_INVALID',
      `resampleBars: targetIntervalMs (${targetIntervalMs}) must be an integer ` +
        `multiple of baseIntervalMs (${baseIntervalMs}); got remainder ` +
        `${targetIntervalMs % baseIntervalMs}`,
    )
  }

  if (bars.length === 0) return []

  // Fast path: no aggregation required. Caller may still want shape parity
  // (each base bar gets sourceStart === sourceEnd === its own index), so we
  // wrap each base bar as a 1-source-bar `ResampledBar`.
  if (targetIntervalMs === baseIntervalMs) {
    const out: ResampledBar[] = new Array(bars.length)
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]
      out[i] = {
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        sourceStart: i,
        sourceEnd: i,
      }
    }
    return out
  }

  const out: ResampledBar[] = []

  let bucketStart = -1 // inclusive index in `bars`
  let bucketTs = 0
  let open = 0
  let high = -Infinity
  let low = Infinity
  let close = 0
  let volume = 0

  const flush = (endIdx: number): void => {
    if (bucketStart < 0) return
    out.push({
      timestamp: bucketTs,
      open,
      high,
      low,
      close,
      volume,
      sourceStart: bucketStart,
      sourceEnd: endIdx,
    })
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    const ts = Math.floor(bar.timestamp / targetIntervalMs) * targetIntervalMs

    if (bucketStart < 0 || ts !== bucketTs) {
      // Boundary crossed (or first iteration). Flush the previous bucket.
      if (bucketStart >= 0) flush(i - 1)
      bucketStart = i
      bucketTs = ts
      open = bar.open
      high = bar.high
      low = bar.low
      close = bar.close
      volume = bar.volume
      continue
    }

    // Same bucket: fold this bar in.
    if (bar.high > high) high = bar.high
    if (bar.low < low) low = bar.low
    close = bar.close
    volume += bar.volume
  }

  // Final bucket — may be partial (fewer than targetIntervalMs/baseIntervalMs bars).
  flush(bars.length - 1)

  return out
}
