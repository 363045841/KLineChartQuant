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

// MA family completion pack (tick 7 b-9)
export { computeALMA, type AlmaOptions } from './alma'
export { computeT3, type T3Options } from './t3'
export { computeZLEMA, type ZlemaOptions } from './zlema'
export { computeLSMA, type LsmaOptions } from './lsma'
export { computeVIDYA, type VidyaOptions } from './vidya'
export { computeFRAMA, type FramaOptions } from './frama'

// Oscillator completion pack (tick 8 b-10)
export { computeStochRSI, type StochRsiOptions } from './stochRSI'
export { computeAwesomeOscillator, type AwesomeOscillatorOptions } from './awesomeOscillator'
export { computeUltimateOscillator, type UltimateOscillatorOptions } from './ultimateOscillator'
export { computeDPO, type DpoOptions } from './dpo'
export { computeFisherTransform, type FisherTransformOptions } from './fisherTransform'
export { computeSchaffTrendCycle, type SchaffTrendCycleOptions } from './schaffTrendCycle'
