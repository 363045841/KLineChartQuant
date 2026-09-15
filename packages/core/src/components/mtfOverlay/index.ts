/**
 * Multi-Timeframe (MTF) overlay barrel.
 *
 * Public surface:
 *   - `resampleBars`: aggregate base-tf bars into higher-tf buckets
 *   - `alignToBaseIndex`: forward-fill higher-tf values onto base-bar indices
 *     (no-lookahead semantics, see file docstring)
 *   - `createMtfController`: composes the above + a user-supplied `compute`
 *     into a reactive multi-series controller
 *
 * The controller is intentionally indicator-agnostic — any indicator (EMA,
 * RSI, custom) can be lifted to MTF by passing a `compute` fn that takes
 * resampled bars and returns one number per bar.
 */

export { alignToBaseIndex } from './alignToBaseIndex'
export { type CreateMtfControllerInit, createMtfController } from './createMtfController'
export { resampleBars } from './resampleBars'
export type {
  ActiveMtfSeries,
  BaseBar,
  MtfController,
  MtfSeriesDefinition,
  ResampledBar,
} from './types'
