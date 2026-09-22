// 坐标系模块公共出口：契约来自 types.ts，实现来自 impl/。
export { computeAnchoredZoom } from './impl/anchoredZoom.js'
export { createPriceScale } from './impl/createPriceScale.js'
export { createTimeScale } from './impl/createTimeScale.js'
export { createOriginShiftPolicy } from './impl/originShift.js'
export type {
  AnchoredZoomOptions,
  AnchoredZoomResult,
  OriginShiftPolicy,
  PriceScale,
  PriceScaleConfig,
  ScaleMode,
  TimeScale,
  TimeScaleConfig,
} from './types.js'
