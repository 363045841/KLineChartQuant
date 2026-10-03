/** 图表模式模块入口：对外暴露模式契约与实现。 */

export type {
  FiveDayTimeShareFrameGeometry,
  FiveDayTimeShareGeometryInput,
} from './impl/fiveDayTimeShareGeometry.js'
export { computeFiveDayTimeShareGeometry } from './impl/fiveDayTimeShareGeometry.js'
export { KLineMode } from './impl/kLineMode.js'
export type {
  TimeShareBaselineInput,
  TimeSharePriceRange,
  TimeShareTimeLabelInput,
  TimeShareXLayout,
  TimeShareXLayoutInput,
} from './impl/timeShareMath.js'
export {
  ASHARE_TIMESHARE_SESSION_SLOTS,
  computeTimeSharePriceRange,
  computeTimeShareTimeLabelIndices,
  computeTimeShareXLayout,
  resolveFiveDayTimeShareBaseline,
  resolveTimeShareBaseline,
  resolveTimeShareSessionSlots,
  TIMESHARE_MIN_LABEL_SPACING_PX,
} from './impl/timeShareMath.js'
export { TimeShareMode } from './impl/timeShareMode.js'
export * from './types.js'
