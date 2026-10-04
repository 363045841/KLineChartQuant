/** 坐标标度模块：纵向价格标度（scale_Y）、横向槽位标度（scale_X）与轴刻度生成。 */

export { createYAxisTicks } from './impl/axisTicks/axisTicks.js'
export { calculateValueTickPositions } from './impl/axisTicks/tickPosition.js'
export { SCALE_X_STRATEGIES } from './impl/scale_X/scaleXStrategies.js'
export type { ScaleXInput, ScaleXSnapshot, ScaleXStrategy } from './impl/scale_X/types.js'
export type { LogFormula } from './impl/scale_Y/logFormula.js'
export {
  convertPriceRangeFromLog,
  convertPriceRangeToLog,
  fromLog,
  logFormulaForPriceRange,
  logFormulasAreSame,
  toLog,
} from './impl/scale_Y/logFormula.js'
export type { PriceRange } from './impl/scale_Y/price.js'
export { PriceScale } from './impl/scale_Y/priceScale.js'
