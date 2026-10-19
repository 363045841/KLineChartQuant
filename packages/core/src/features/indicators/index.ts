/**
 * @klinechart-quant/core/indicators — headless indicator math.
 *
 * Pure functions over price arrays. No DOM, no signals, no controllers —
 * these are the building blocks consumers compose into UI flows or feed
 * to the legacy scheduler in `src/core/indicators/`.
 *
 * Convention: each indicator's output is a `Float64Array` of the same length
 * as the input, with NaN for indices where the indicator hasn't primed yet.
 * This makes alignment with bar arrays trivial in render code.
 */

export { computeFisherTransform, type FisherTransformOptions } from './fisherTransform.js'
export { computeSchaffTrendCycle, type SchaffTrendCycleOptions } from './schaffTrendCycle.js'
export { computeStochRSI, type StochRsiOptions } from './stochRSI.js'
