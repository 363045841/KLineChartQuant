/** 图表模式模块入口：对外暴露模式契约与实现。 */

export type {
  FiveDayTimeShareFrameGeometry,
  FiveDayTimeShareGeometryInput,
} from './impl/fiveDayTimeShareGeometry.js'
export {
  computeFiveDayTimeShareContentWidth,
  computeFiveDayTimeShareGeometry,
} from './impl/fiveDayTimeShareGeometry.js'
export { KLineMode } from './impl/kLineMode.js'
export type {
  TimeShareBaselineInput,
  TimeSharePaneLayout,
  TimeSharePriceRange,
  TimeShareTimeLabelInput,
  TimeShareVisibleRangeInput,
  TimeShareXLayout,
  TimeShareXLayoutInput,
} from './impl/timeShareMath.js'
export {
  ASHARE_TIMESHARE_SESSION_SLOTS,
  computeTimeShareBarMetrics,
  computeTimeSharePaneLayout,
  computeTimeSharePriceRange,
  computeTimeShareTimeLabelIndices,
  computeTimeShareVisibleRange,
  computeTimeShareXLayout,
  resolveFiveDayTimeShareBaseline,
  resolveTimeShareBaseline,
  resolveTimeShareSessionSlots,
  TIMESHARE_MIN_LABEL_SPACING_PX,
} from './impl/timeShareMath.js'
export { TimeShareMode } from './impl/timeShareMode.js'
export * from './types.js'
