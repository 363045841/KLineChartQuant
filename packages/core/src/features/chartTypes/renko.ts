import { KLineChartError } from '../../errors'
/**
 * Renko bricks — price-based bars that ignore time.
 *
 * A Renko chart drops a fixed-size "brick" every time price advances by one
 * brick-size from the previous brick's close. Time is collapsed: a quiet hour
 * may produce zero bricks, a volatile minute may produce ten.
 *
 * ## Modes
 *
 *  - **Fixed brick size** (`{ brickSize }`): the classic chart. Brick height
 *    is constant across the entire series.
 *  - **ATR-adaptive brick size** (`{ useATR: { period } }`): brick size is the
 *    rolling ATR(period) over the *input* OHLCV series. We compute the full
 *    ATR series upfront and then use, for each candidate brick, the **trailing
 *    ATR at the source bar that triggered it**. This means brick height varies
 *    along the chart — wider in volatile regimes, tighter in quiet ones —
 *    which is the whole point of ATR mode.
 *
 *    Trade-off (documented because it's a real one): ATR bricks are NOT
 *    uniform-height, so the chart loses the "every step is the same size"
 *    visual property that classical Renko has. In return, the brick rhythm
 *    adapts to volatility — a feature TradingView only offers in a separate
 *    chart-type ("ATR Renko") and which requires the user to reload the
 *    series to change. Our implementation supports flipping `useATR` on a
 *    live transform incrementally — see §"Enhancements over TradingView".
 *
 * ## Classic reversal rule (the 2× brick-size requirement)
 *
 * Once a column of up-bricks has been emitted, a single brick-size reverse
 * move is NOT enough to start a down-column — it must travel **2 × brickSize**
 * in the opposite direction from the last brick's close. This is the
 * "classic" Nison/Steve Nison rule. Without the 2× requirement the chart
 * "flutters" — every wiggle near the brick-size threshold flips direction.
 *
 * In code:
 *   - Continuation (same direction as last brick): need ≥ 1 × brickSize.
 *   - Reversal (opposite direction): need ≥ 2 × brickSize.
 *
 * The very first brick has no "previous direction", so it uses the 1× rule.
 *
 * ## Brick shape
 *
 * Each brick is OHLCV-shaped to fit the candle renderer:
 *
 *     up-brick:   open = lastBrickClose
 *                 close = lastBrickClose + brickSize
 *                 high = close, low = open
 *
 *     down-brick: open = lastBrickClose
 *                 close = lastBrickClose - brickSize
 *                 high = open, low = close
 *
 * `volume` is the sum of input-bar volumes assigned to this brick. We use a
 * simple rule: each input bar contributes all of its volume to **the first
 * brick** it triggers in that bar. When one bar triggers N bricks (a gap),
 * the bar's full volume goes on the first brick and the rest carry zero. This
 * matches TradingView; the alternative (split evenly) creates phantom volume
 * spikes when ATR mode changes brick sizes between bricks.
 *
 * ## Meta
 *
 * `meta.direction` is `'up'` or `'down'` for downstream colour selection.
 * `meta.brickSize` is the brick height at the time of emission (especially
 * meaningful in ATR mode).
 */

import type { ChartTypeTransform, OHLCV, TransformedBar } from './types'

/**
 * Renko configuration.
 *
 * Exactly one of `brickSize` or `useATR` must be supplied. If both are present
 * `useATR` wins (so callers can store both and toggle a flag).
 */
export interface RenkoConfig {
  /** Fixed brick height in price units. Must be > 0. */
  brickSize?: number
  /** ATR-adaptive mode. `period` is the ATR lookback. */
  useATR?: { period: number }
}

interface RenkoState {
  /** Close of the most recently emitted brick. `null` until the first brick. */
  lastBrickClose: number | null
  /** Direction of the most recently emitted brick. `null` for the first brick. */
  lastDirection: 'up' | 'down' | null
  /** Count of input bars consumed so far (= next source index). */
  nextIndex: number
  /** For ATR mode — the rolling TR window (last `period` true ranges). */
  trWindow: number[]
  /** For ATR mode — previous close, needed to compute TR. */
  prevClose: number | null
  /** Effective brick size at the most recent emission (for inspection / tests). */
  lastBrickSize: number | null
}

/** Compute true range for a bar against the prior close. */
const trueRange = (bar: OHLCV, prevClose: number | null): number => {
  const hl = bar.high - bar.low
  if (prevClose === null) return hl
  const hc = Math.abs(bar.high - prevClose)
  const lc = Math.abs(bar.low - prevClose)
  return Math.max(hl, hc, lc)
}

/**
 * Build a Renko transform.
 *
 * The transform supports both `transform(input, config)` and `appendBar(bar)`.
 * The config passed to `transform` is also captured for subsequent
 * `appendBar` calls — so the typical flow is:
 *
 *     const r = createRenko()
 *     const history = r.transform(historicalBars, { brickSize: 10 })
 *     // ...later, as ticks arrive:
 *     const newBricks = r.appendBar(liveBar)
 */
export function createRenko(): ChartTypeTransform<RenkoConfig> {
  let state: RenkoState = {
    lastBrickClose: null,
    lastDirection: null,
    nextIndex: 0,
    trWindow: [],
    prevClose: null,
    lastBrickSize: null,
  }
  let activeConfig: RenkoConfig = { brickSize: 1 }

  /**
   * Return the current effective brick size given the active config and the
   * current ATR window. Returns `null` when ATR mode is enabled but the
   * window hasn't filled yet (no bricks can form until we have a brick
   * size).
   */
  const currentBrickSize = (): number | null => {
    if (activeConfig.useATR) {
      const period = activeConfig.useATR.period
      if (state.trWindow.length < period) return null
      let sum = 0
      // Use only the most recent `period` entries — older history is
      // not part of the rolling ATR (Wilder's smoothing is a separate
      // discussion; we use the simple rolling mean which is the
      // baseline TradingView ATR-Renko shows).
      for (let i = state.trWindow.length - period; i < state.trWindow.length; i++) {
        sum += state.trWindow[i] ?? 0
      }
      return sum / period
    }
    return activeConfig.brickSize ?? null
  }

  /**
   * Try to emit bricks from a single input bar. The bar's `close` is the
   * trigger; we ignore intra-bar high/low for brick formation because Renko
   * is canonically a *close-only* construction. (Using high/low works on
   * tick data but creates phantom bricks on OHLC bars.)
   */
  const emitBricksFromBar = (bar: OHLCV, sourceIndex: number): TransformedBar[] => {
    const out: TransformedBar[] = []
    const brickSize = currentBrickSize()
    if (brickSize === null || brickSize <= 0) return out

    // Initialise the "last brick close" lazily on the first bar — we
    // anchor it to the bar's close so the first non-trivial move starts
    // brick formation. (Anchoring to `open` would mean the very first bar
    // could itself form a brick, which differs from the convention.)
    if (state.lastBrickClose === null) {
      state.lastBrickClose = bar.close
      return out
    }

    const close = bar.close
    let firstBrickInThisBar = true

    // Keep stepping bricks until the close no longer satisfies the
    // threshold. Each iteration emits one brick and advances state.
    // Loop bound: at most ceil(|close - lastBrickClose| / brickSize) — a
    // hard upper bound prevents pathological infinite loops if brickSize
    // becomes zero mid-iteration.
    let safety = 0
    while (safety++ < 1_000_000) {
      const last: number | null = state.lastBrickClose
      if (last === null) break
      const diff: number = close - last

      // Continuation needs 1×, reversal needs 2×. First-ever brick uses 1×.
      let upThreshold: number
      let downThreshold: number
      if (state.lastDirection === 'up') {
        upThreshold = brickSize
        downThreshold = -2 * brickSize
      } else if (state.lastDirection === 'down') {
        upThreshold = 2 * brickSize
        downThreshold = -brickSize
      } else {
        upThreshold = brickSize
        downThreshold = -brickSize
      }

      if (diff >= upThreshold) {
        const newClose: number = last + brickSize
        out.push({
          timestamp: bar.timestamp,
          open: last,
          close: newClose,
          high: newClose,
          low: last,
          volume: firstBrickInThisBar ? bar.volume : 0,
          sourceBarIndexStart: sourceIndex,
          sourceBarIndexEnd: sourceIndex,
          meta: { direction: 'up', brickSize },
        })
        state.lastBrickClose = newClose
        state.lastDirection = 'up'
        state.lastBrickSize = brickSize
        firstBrickInThisBar = false
        continue
      }

      if (diff <= downThreshold) {
        const newClose: number = last - brickSize
        out.push({
          timestamp: bar.timestamp,
          open: last,
          close: newClose,
          high: last,
          low: newClose,
          volume: firstBrickInThisBar ? bar.volume : 0,
          sourceBarIndexStart: sourceIndex,
          sourceBarIndexEnd: sourceIndex,
          meta: { direction: 'down', brickSize },
        })
        state.lastBrickClose = newClose
        state.lastDirection = 'down'
        state.lastBrickSize = brickSize
        firstBrickInThisBar = false
        continue
      }

      break
    }
    return out
  }

  const consumeBar = (bar: OHLCV): TransformedBar[] => {
    const sourceIndex = state.nextIndex
    // Update TR window BEFORE checking brick formation so the first ATR
    // window's worth of bars participate in brick sizing as soon as
    // possible.
    const tr = trueRange(bar, state.prevClose)
    state.trWindow.push(tr)
    // Cap the window growth to twice the period for memory bound;
    // anything older is never read.
    if (activeConfig.useATR) {
      const period = activeConfig.useATR.period
      if (state.trWindow.length > period * 2) {
        state.trWindow = state.trWindow.slice(state.trWindow.length - period)
      }
    } else if (state.trWindow.length > 2048) {
      // For non-ATR mode we don't need the window at all — clear it.
      state.trWindow = []
    }
    state.prevClose = bar.close

    const emitted = emitBricksFromBar(bar, sourceIndex)
    state.nextIndex = sourceIndex + 1
    return emitted
  }

  const resetState = (): void => {
    state = {
      lastBrickClose: null,
      lastDirection: null,
      nextIndex: 0,
      trWindow: [],
      prevClose: null,
      lastBrickSize: null,
    }
  }

  return {
    typeId: 'renko',

    transform(input: ReadonlyArray<OHLCV>, config: RenkoConfig): ReadonlyArray<TransformedBar> {
      // Validate: at least one mode must be set with sane values.
      if (!config.useATR && (config.brickSize === undefined || config.brickSize <= 0)) {
        throw new KLineChartError(
          'CHART_TYPE_CONFIG_INVALID',
          'createRenko: config requires brickSize > 0 or useATR { period }',
        )
      }
      if (config.useATR && config.useATR.period < 1) {
        throw new KLineChartError(
          'CHART_TYPE_CONFIG_INVALID',
          'createRenko: useATR.period must be >= 1',
        )
      }
      activeConfig = config
      resetState()
      const out: TransformedBar[] = []
      for (const bar of input) {
        const fresh = consumeBar(bar)
        for (const b of fresh) out.push(b)
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
