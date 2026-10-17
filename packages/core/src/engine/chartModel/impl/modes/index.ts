/** 图表模式实现入口：对外暴露模式契约与各视图的行为实现。 */

export { computeFiveDayTimeShareGeometry } from './fiveDayTimeShareGeometry.js'
export { KLineMode } from './kLineMode.js'
export {
  computeTimeShareXLayout,
  resolveFiveDayTimeShareBaseline,
  resolveTimeShareBaseline,
} from './timeShareMath.js'
export { TimeShareMode } from './timeShareMode.js'
export * from './types.js'
