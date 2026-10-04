/** 图表模式实现入口：对外暴露模式契约与各视图的行为实现。 */

export type {
  FiveDayTimeShareFrameGeometry,
  FiveDayTimeShareGeometryInput,
} from './fiveDayTimeShareGeometry.js'
export { computeFiveDayTimeShareGeometry } from './fiveDayTimeShareGeometry.js'
export { KLineMode } from './kLineMode.js'
export type {
  TimeShareBaselineInput,
  TimeSharePriceRange,
  TimeShareTimeLabelInput,
  TimeShareXLayout,
  TimeShareXLayoutInput,
} from './timeShareMath.js'
export {
  ASHARE_TIMESHARE_SESSION_SLOTS,
  computeTimeSharePriceRange,
  computeTimeShareTimeLabelIndices,
  computeTimeShareXLayout,
  resolveFiveDayTimeShareBaseline,
  resolveTimeShareBaseline,
  resolveTimeShareSessionSlots,
  TIMESHARE_MIN_LABEL_SPACING_PX,
} from './timeShareMath.js'
export { TimeShareMode } from './timeShareMode.js'
export * from './types.js'
