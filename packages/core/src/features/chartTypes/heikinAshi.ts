/**
 * Heikin Ashi — "average bar" smoothing of an OHLCV series.
 *
 * Heikin Ashi (平均足) was popularised by Munehisa Homma; the modern formula
 * is the one taught by Dan Valcu. It produces a one-to-one transform — each
 * input bar yields exactly one output bar — but the values are smoothed so
 * trends visually persist through noise.
 *
 * ## Formula
 *
 *     HA_close[i]  = (O[i] + H[i] + L[i] + C[i]) / 4
 *     HA_open[i]   = (HA_open[i-1] + HA_close[i-1]) / 2          for i >= 1
 *     HA_open[0]   = (O[0] + C[0]) / 2                            (seed)
 *     HA_high[i]   = max(H[i], HA_open[i], HA_close[i])
 *     HA_low[i]    = min(L[i], HA_open[i], HA_close[i])
 *     HA_volume[i] = V[i]                                         (unchanged)
 *
 * The seed for `HA_open[0]` is the standard convention used by all major
 * charting platforms (TradingView, MetaTrader). An alternative seed of
 * `O[0]` exists in some older books but produces a slightly different shape
 * for the first bar; we follow the modern convention.
 *
 * ## Trade-offs
 *
 *  - Volume is **not** smoothed. Smoothing volume distorts indicators that
 *    consume the derived series (OBV, VWAP, CMF), so we keep it raw. This
 *    matches TradingView's behaviour.
 *  - Output `timestamp` equals input `timestamp` — Heikin Ashi does not
 *    re-bucket time.
 *
 * ## Statefulness
 *
 * The transform carries `HA_open[i-1]` and `HA_close[i-1]` between calls so
 * `appendBar` produces the same result as a batch `transform` over the same
 * series. The `reset()` method clears that carry.
 */

import type { ChartTypeTransform, OHLCV, TransformedBar } from './types'

/** Heikin Ashi has no configuration. The empty type makes the contract explicit. */
export type HeikinAshiConfig = Record<string, never>

interface HAState {
  /** Previous HA_open. */
  prevOpen: number
  /** Previous HA_close. */
  prevClose: number
  /** Index of the next input bar (i.e. count of bars consumed so far). */
  nextIndex: number
}

/**
 * Build a Heikin Ashi transform. The returned object is stateful — `transform`
 * resets state before running, `appendBar` mutates state, `reset` clears it.
 *
 * The factory pattern (rather than a singleton) matches the controller style
 * elsewhere in this package — multiple panes can each hold their own
 * independent transform without crossed state.
 */
export function createHeikinAshi(): ChartTypeTransform<HeikinAshiConfig> {
  let state: HAState | null = null

  /**
   * Compute one HA bar. `prev` is `null` for the very first bar in a series,
   * which triggers the seed `HA_open = (O + C) / 2`.
   */
  const computeBar = (
    bar: OHLCV,
    prev: { prevOpen: number; prevClose: number } | null,
    sourceIndex: number,
  ): TransformedBar => {
    const haClose = (bar.open + bar.high + bar.low + bar.close) / 4
    const haOpen = prev === null ? (bar.open + bar.close) / 2 : (prev.prevOpen + prev.prevClose) / 2
    const haHigh = Math.max(bar.high, haOpen, haClose)
    const haLow = Math.min(bar.low, haOpen, haClose)
    return {
      timestamp: bar.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: bar.volume,
      sourceBarIndexStart: sourceIndex,
      sourceBarIndexEnd: sourceIndex,
    }
  }

  return {
    typeId: 'heikin-ashi',

    transform(input: ReadonlyArray<OHLCV>): ReadonlyArray<TransformedBar> {
      state = null
      const out: TransformedBar[] = []
      for (let i = 0; i < input.length; i++) {
        const bar = input[i]
        if (!bar) continue
        const ha = computeBar(
          bar,
          state === null ? null : { prevOpen: state.prevOpen, prevClose: state.prevClose },
          i,
        )
        out.push(ha)
        state = { prevOpen: ha.open, prevClose: ha.close, nextIndex: i + 1 }
      }
      return out
    },

    appendBar(bar: OHLCV): ReadonlyArray<TransformedBar> {
      const prev = state === null ? null : { prevOpen: state.prevOpen, prevClose: state.prevClose }
      const nextIndex = state === null ? 0 : state.nextIndex
      const ha = computeBar(bar, prev, nextIndex)
      state = { prevOpen: ha.open, prevClose: ha.close, nextIndex: nextIndex + 1 }
      return [ha]
    },

    reset(): void {
      state = null
    },
  }
}
