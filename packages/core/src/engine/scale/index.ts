/** 坐标标度模块：纵向价格标度（scale_Y）、横向槽位标度（scale_X）与轴刻度生成。 */

export { createYAxisTicks } from './impl/axisTicks/axisTicks.js'
export { SCALE_X_STRATEGIES } from './impl/scale_X/scaleXStrategies.js'
export type { ScaleXInput, ScaleXSnapshot } from './impl/scale_X/types.js'
export type { PriceRange } from './impl/scale_Y/price.js'
export { PriceScale } from './impl/scale_Y/priceScale.js'
