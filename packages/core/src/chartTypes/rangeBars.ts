import { KLineChartError } from '../errors'
/**
 * Range Bars — fixed-range price bars.
 *
 * Every output bar spans exactly `range` price units (high - low === range at
 * close). When the active bar's range reaches the threshold it is closed and
 * a new bar begins, opening at the trigger price. Time, like Renko and P&F,
 * is collapsed.
 *
 * ## Why range bars over Renko
 *
 *  - **Renko** uses only the close; intra-bar wicks are invisible. Good for
 *    long-term swing visualisation.
 *  - **Range bars** use the entire (high, low) of every input bar. They show
 *    intra-bar excursions and tend to be more responsive to spikes.
 *
 * ## Algorithm
 *
 * State carries the in-progress bar `{open, high, low, volume, ...}`. For each
 * input bar:
 *
 *   1. Decide a *direction* for the input bar (`up` if close >= open, else
 *      `down`). Range bars need a direction because OHLC bars don't carry the
 *      tick-level path between low and high.
 *   2. Merge the input bar into the open bar BUT only along the direction —
 *      meaning we honour both high and low, but if the merged span exceeds
 *      `range` we *carve* the range bar in the direction of motion.
 *   3. Carving: an "up" input that pushes total span past `range` closes the
 *      current bar at `low + range`. The carved excess starts the next bar
 *      with `open = low + range`, and any remaining high above the carved
 *      ceiling becomes the next bar's high (recursion).
 *   4. Edge case: a single input bar with `high - low > range` walks the bar's
 *      range in `range`-sized steps in the input's direction and emits one
 *      output bar per full step.
 *
 * ## Direction heuristic for OHLC inputs
 *
 * When closing from a single input contribution, we use `input.close >= input.open`
 * to choose the carve direction. This is the same heuristic TradingView uses
 * with OHLC input — exact tick-by-tick directionality would require trades.
 *
 * ## Volume aggregation
 *
 * Volume is summed across every input bar that contributes any range. For a
 * single input that produces multiple output bars (a split), the input's
 * volume is divided proportionally to the price extent each output bar
 * carves of the input bar's total H-L.
 *
 * ## Emission strategy
 *
 * `transform()` returns every closed bar PLUS the currently-open bar (mirrors
 * a live chart). `appendBar()` returns only the bars that closed on this
 * append — the open bar is held in state. Tests assert the closed prefix
 * matches between modes.
 */

import type { ChartTypeTransform, OHLCV, TransformedBar } from './types'

export interface RangeBarsConfig {
  /** Range height in price units. Must be > 0. */
  range: number
}

interface OpenRangeBar {
  open: number
  high: number
  low: number
  volume: number
  sourceStart: number
  sourceEnd: number
  timestamp: number
}

interface RangeState {
  open: OpenRangeBar | null
  nextIndex: number
  closed: TransformedBar[]
}

const makeClosed = (
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  sourceStart: number,
  sourceEnd: number,
  timestamp: number,
): TransformedBar => {
  const direction: 'up' | 'down' = close >= open ? 'up' : 'down'
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    sourceBarIndexStart: sourceStart,
    sourceBarIndexEnd: sourceEnd,
    meta: { direction },
  }
}

export function createRangeBars(): ChartTypeTransform<RangeBarsConfig> {
  let state: RangeState = { open: null, nextIndex: 0, closed: [] }
  let activeConfig: RangeBarsConfig = { range: 1 }

  /**
   * Merge one input bar into the open range bar, carving as many closed
   * range bars as needed. Returns the bars that closed during this merge.
   */
  const consumeBar = (bar: OHLCV): TransformedBar[] => {
    const sourceIndex = state.nextIndex
    state.nextIndex = sourceIndex + 1
    const range = activeConfig.range
    const closed: TransformedBar[] = []

    const upward = bar.close >= bar.open
    const inputExtent = Math.max(bar.high - bar.low, 1e-12)

    // Seed: no in-progress bar yet. Open one at the input's open. The
    // input's full H/L participates immediately.
    if (state.open === null) {
      state.open = {
        open: bar.open,
        high: bar.open,
        low: bar.open,
        volume: 0,
        sourceStart: sourceIndex,
        sourceEnd: sourceIndex,
        timestamp: bar.timestamp,
      }
    }

    // Track how much input volume we've attributed so we can split it
    // proportionally across any carved bars.
    let inputVolUsed = 0

    // Repeatedly merge the input into the open bar; each iteration either
    // (a) closes a bar and seeds a new open one from the carved-off
    // remainder, or (b) finishes by absorbing the entire input range.
    //
    // We walk the input bar along its direction. `remainingHigh` and
    // `remainingLow` shrink as we carve. We stop when no further range
    // bar can be closed.
    let remainingHigh = bar.high
    let remainingLow = bar.low

    let safety = 0
    while (safety++ < 1_000_000) {
      const opened = state.open!
      // Apply the remaining input extent to the open bar.
      const mergedHigh = Math.max(opened.high, remainingHigh)
      const mergedLow = Math.min(opened.low, remainingLow)
      const span = mergedHigh - mergedLow
      if (span < range) {
        // Whole remainder fits within range — absorb and stop.
        opened.high = mergedHigh
        opened.low = mergedLow
        opened.sourceEnd = sourceIndex
        opened.timestamp = bar.timestamp
        // All remaining input volume goes here.
        opened.volume += bar.volume - inputVolUsed
        inputVolUsed = bar.volume
        break
      }

      // Span >= range. Carve a range bar in the direction of motion.
      // For an up bar: close at low + range (we move up first).
      // For a down bar: close at high - range.
      let closePrice: number
      let closedHigh: number
      let closedLow: number
      if (upward) {
        closedLow = mergedLow
        closedHigh = mergedLow + range
        closePrice = closedHigh
      } else {
        closedHigh = mergedHigh
        closedLow = mergedHigh - range
        closePrice = closedLow
      }

      // Volume attributed to this carved bar: proportional to the
      // input extent it covers, plus any volume already accumulated on
      // the open bar from prior input bars.
      const carvedExtent = Math.min(range, span)
      const inputShare = (carvedExtent / inputExtent) * bar.volume
      const attribInput = Math.min(inputShare, bar.volume - inputVolUsed)
      inputVolUsed += attribInput

      const closedVolume = opened.volume + attribInput
      closed.push(
        makeClosed(
          opened.open,
          closedHigh,
          closedLow,
          closePrice,
          closedVolume,
          opened.sourceStart,
          sourceIndex,
          bar.timestamp,
        ),
      )
      state.closed.push(closed[closed.length - 1] as TransformedBar)

      // Seed the next open bar at the carve boundary. The remaining
      // input extent above (for up) or below (for down) the carve
      // continues into the new bar.
      if (upward) {
        remainingLow = closePrice
        state.open = {
          open: closePrice,
          high: closePrice,
          low: closePrice,
          volume: 0,
          sourceStart: sourceIndex,
          sourceEnd: sourceIndex,
          timestamp: bar.timestamp,
        }
        // If the input bar's high is no greater than the carve
        // ceiling, nothing more from this input remains for further
        // carving.
        if (remainingHigh <= closePrice) {
          // The new open bar already has open=closePrice; the
          // remaining high contributes nothing further. Stop.
          state.open.high = closePrice
          state.open.low = closePrice
          // Attribute leftover input volume to the now-current open.
          state.open.volume = bar.volume - inputVolUsed
          inputVolUsed = bar.volume
          break
        }
      } else {
        remainingHigh = closePrice
        state.open = {
          open: closePrice,
          high: closePrice,
          low: closePrice,
          volume: 0,
          sourceStart: sourceIndex,
          sourceEnd: sourceIndex,
          timestamp: bar.timestamp,
        }
        if (remainingLow >= closePrice) {
          state.open.high = closePrice
          state.open.low = closePrice
          state.open.volume = bar.volume - inputVolUsed
          inputVolUsed = bar.volume
          break
        }
      }
    }

    return closed
  }

  const resetState = (): void => {
    state = { open: null, nextIndex: 0, closed: [] }
  }

  return {
    typeId: 'range-bars',

    transform(input: ReadonlyArray<OHLCV>, config: RangeBarsConfig): ReadonlyArray<TransformedBar> {
      if (config.range <= 0 || !Number.isFinite(config.range)) {
        throw new KLineChartError('CHART_TYPE_CONFIG_INVALID', 'createRangeBars: range must be > 0')
      }
      activeConfig = config
      resetState()
      for (const bar of input) consumeBar(bar)
      const out = [...state.closed]
      if (state.open !== null) {
        // The trailing in-progress bar's "close" is its frontier — the
        // direction of last accumulation. We pick high for "up" if
        // close>=open, else low, matching candle semantics.
        const o = state.open
        const close = o.high - o.open >= o.open - o.low ? o.high : o.low
        out.push(
          makeClosed(
            o.open,
            o.high,
            o.low,
            close,
            o.volume,
            o.sourceStart,
            o.sourceEnd,
            o.timestamp,
          ),
        )
      }
      return out
    },

    appendBar(bar: OHLCV): ReadonlyArray<TransformedBar> {
      return consumeBar(bar)
    },

    reset(): void {
      resetState()
    },
  }
}
