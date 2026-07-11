import { KLineChartError } from '../../errors'
/**
 * Point & Figure (P&F) — classic three-box-reversal column chart.
 *
 * P&F is the oldest non-time chart type still in use (de Villiers documented
 * it in 1933, traders were drawing it on graph paper a century before that).
 * It is a column chart: each column is either rising X's or falling O's, and
 * we move to a new column only when price reverses by `reversal × boxSize`.
 *
 * ## Algorithm (classic 3-box reversal)
 *
 *  - State: current column `direction`, current column extent `[low, high]`.
 *  - For each new input bar with `[H, L]`:
 *
 *    - If column is X (up):
 *        * If `H >= high + boxSize`: extend the X column up to the highest box
 *          containing `H` (i.e. set `high := floor(H / boxSize) * boxSize`).
 *        * Else if `L <= high - reversal * boxSize`: reverse — start a new O
 *          column. The new column starts **one box below** the prior X
 *          column's high, and goes down to the lowest box `>= L`. The "one
 *          box below" rule is the classical de Villiers convention and is
 *          what TradingView uses.
 *        * Else: bar does nothing.
 *
 *    - Symmetric for an O (down) column.
 *
 *  - First-ever input bar seeds the chart with an X column anchored on the
 *    bar's `low` rounded down to a box boundary, extended up to `H` rounded
 *    down to a box boundary. (Some traditions start with the high; we use
 *    low-anchored which is more deterministic for a single bar.)
 *
 * ## Why this is lossy by design
 *
 * P&F deletes time entirely. Two bars produced at very different times can
 * land in the same column. We therefore set every output column's
 * `timestamp` to the timestamp of the source bar that **closed** the column
 * (i.e. the last bar that touched it). This gives downstream tooltips a
 * meaningful anchor while honouring the lossy semantics.
 *
 * ## OHLCV mapping for one column
 *
 *  - `open`  = starting box price (column entry)
 *  - `close` = final box price (column exit / current frontier)
 *  - `high`  = max box price reached in this column
 *  - `low`   = min box price reached in this column
 *  - `volume`= sum of input bar volumes that touched this column
 *
 * For an X column `close === high` and `open === low`. For an O column
 * `close === low` and `open === high`. We populate `meta.direction` so
 * renderers can colour distinctly.
 *
 * ## Reversal vs extension at the exact threshold
 *
 * If a bar simultaneously satisfies both extension and reversal — e.g. an X
 * column where `H >= high + boxSize` AND `L <= high - reversal * boxSize` —
 * **extension wins** (we follow the direction-of-momentum rule). This avoids
 * "chop" in volatile bars but is a deliberate trade-off; some older systems
 * give reversal priority on the basis of "the down move came second". We
 * pick extension because it matches modern interactive P&F implementations
 * including TradingView.
 *
 * ## Emission strategy
 *
 * Each completed column emits exactly **one** TransformedBar — the column's
 * snapshot at the moment it closed. While a column is still "open" (i.e. it
 * is the current column being extended) it does NOT appear in the output.
 * `appendBar` therefore returns `[]` for bars that only extend the current
 * column, and `[completedColumn, ...]` for bars that trigger a reversal.
 *
 * In batch mode `transform()` returns every column INCLUDING the in-progress
 * final column so the user sees the full picture. This is the only place
 * where batch and incremental diverge — and it's intentional, because there
 * is no streaming convention to "tentatively emit" a still-open column.
 * Tests assert that *closed* columns match between modes.
 */

import type { ChartTypeTransform, OHLCV, TransformedBar } from './types'

export interface PointAndFigureConfig {
  /** Box height in price units. Must be > 0. */
  boxSize: number
  /** Reversal in number of boxes. Classic value is 3. Must be >= 1. */
  reversal: number
}

interface PFColumn {
  direction: 'up' | 'down'
  /** Price of the column's first box (entry). */
  startPrice: number
  /** Price of the column's current frontier box. */
  endPrice: number
  /** Source index range this column has aggregated. */
  sourceStart: number
  sourceEnd: number
  /** Sum of input bar volumes accumulated into this column. */
  volume: number
  /** Timestamp of the last bar that touched this column. */
  timestamp: number
}

interface PFState {
  column: PFColumn | null
  nextIndex: number
  closedColumns: TransformedBar[]
}

/**
 * Convert an internal column to a `TransformedBar`. We compute `open`, `close`,
 * `high`, `low` from the column's two endpoints (P&F columns are monotonic in
 * one direction so the two endpoints are the extremes).
 */
const columnToBar = (col: PFColumn): TransformedBar => {
  const open = col.startPrice
  const close = col.endPrice
  const high = Math.max(open, close)
  const low = Math.min(open, close)
  return {
    timestamp: col.timestamp,
    open,
    high,
    low,
    close,
    volume: col.volume,
    sourceBarIndexStart: col.sourceStart,
    sourceBarIndexEnd: col.sourceEnd,
    meta: { direction: col.direction },
  }
}

export function createPointAndFigure(): ChartTypeTransform<PointAndFigureConfig> {
  let state: PFState = { column: null, nextIndex: 0, closedColumns: [] }
  let activeConfig: PointAndFigureConfig = { boxSize: 1, reversal: 3 }

  /** Snap `p` down to the nearest box boundary. */
  const floorToBox = (p: number, box: number): number => Math.floor(p / box) * box
  /** Snap `p` up to the nearest box boundary. */
  const ceilToBox = (p: number, box: number): number => Math.ceil(p / box) * box

  /**
   * Process one input bar and return any column(s) that **closed** as a
   * result. The in-progress column is held in `state.column` and is NOT
   * returned until it closes (i.e. a reversal pushes it into closedColumns).
   */
  const consumeBar = (bar: OHLCV): TransformedBar[] => {
    const sourceIndex = state.nextIndex
    state.nextIndex = sourceIndex + 1
    const { boxSize, reversal } = activeConfig
    const closed: TransformedBar[] = []

    // Seed: no current column. Anchor an X column on the bar's low/high
    // rounded to box boundaries. If high-low rounds to the same box (very
    // narrow bar) we still create a degenerate column of height zero so
    // the chart has a starting point — it will be extended by future bars.
    if (state.column === null) {
      const start = floorToBox(bar.low, boxSize)
      const end = floorToBox(bar.high, boxSize)
      state.column = {
        direction: 'up',
        startPrice: start,
        endPrice: end,
        sourceStart: sourceIndex,
        sourceEnd: sourceIndex,
        volume: bar.volume,
        timestamp: bar.timestamp,
      }
      return closed
    }

    const col = state.column

    if (col.direction === 'up') {
      // Try extension first (extension wins ties — see file header).
      const newHigh = floorToBox(bar.high, boxSize)
      if (newHigh >= col.endPrice + boxSize) {
        col.endPrice = newHigh
        col.sourceEnd = sourceIndex
        col.volume += bar.volume
        col.timestamp = bar.timestamp
        return closed
      }
      // Then reversal.
      if (bar.low <= col.endPrice - reversal * boxSize) {
        // Close the X column.
        closed.push(columnToBar(col))
        state.closedColumns.push(closed[closed.length - 1] as TransformedBar)
        // Start a new O column ONE box below the X column's high.
        const newColumnStart = col.endPrice - boxSize
        const newColumnEnd = ceilToBox(bar.low, boxSize)
        state.column = {
          direction: 'down',
          startPrice: newColumnStart,
          endPrice: newColumnEnd <= newColumnStart ? newColumnEnd : newColumnStart,
          sourceStart: sourceIndex,
          sourceEnd: sourceIndex,
          volume: bar.volume,
          timestamp: bar.timestamp,
        }
        return closed
      }
      // Bar does nothing — still attribute volume + advance source range
      // so the column's metadata reflects the bars that touched it.
      col.sourceEnd = sourceIndex
      col.volume += bar.volume
      col.timestamp = bar.timestamp
      return closed
    }

    // col.direction === 'down'
    const newLow = ceilToBox(bar.low, boxSize)
    if (newLow <= col.endPrice - boxSize) {
      col.endPrice = newLow
      col.sourceEnd = sourceIndex
      col.volume += bar.volume
      col.timestamp = bar.timestamp
      return closed
    }
    if (bar.high >= col.endPrice + reversal * boxSize) {
      closed.push(columnToBar(col))
      state.closedColumns.push(closed[closed.length - 1] as TransformedBar)
      const newColumnStart = col.endPrice + boxSize
      const newColumnEnd = floorToBox(bar.high, boxSize)
      state.column = {
        direction: 'up',
        startPrice: newColumnStart,
        endPrice: newColumnEnd >= newColumnStart ? newColumnEnd : newColumnStart,
        sourceStart: sourceIndex,
        sourceEnd: sourceIndex,
        volume: bar.volume,
        timestamp: bar.timestamp,
      }
      return closed
    }
    col.sourceEnd = sourceIndex
    col.volume += bar.volume
    col.timestamp = bar.timestamp
    return closed
  }

  const resetState = (): void => {
    state = { column: null, nextIndex: 0, closedColumns: [] }
  }

  return {
    typeId: 'point-and-figure',

    transform(
      input: ReadonlyArray<OHLCV>,
      config: PointAndFigureConfig,
    ): ReadonlyArray<TransformedBar> {
      if (config.boxSize <= 0) {
        throw new KLineChartError(
          'CHART_TYPE_CONFIG_INVALID',
          'createPointAndFigure: boxSize must be > 0',
        )
      }
      if (config.reversal < 1 || !Number.isFinite(config.reversal)) {
        throw new KLineChartError(
          'CHART_TYPE_CONFIG_INVALID',
          'createPointAndFigure: reversal must be >= 1',
        )
      }
      activeConfig = config
      resetState()
      for (const bar of input) {
        consumeBar(bar)
      }
      // Batch mode includes the currently-open column as the last entry —
      // see file header. Incremental mode does not.
      const out = [...state.closedColumns]
      if (state.column !== null) {
        out.push(columnToBar(state.column))
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
