/**
 * geometry 模块唯一公开入口：与业务无关的二维几何值类型与纯谓词。
 *
 * 只提供“点/矩形/线段/多边形”之间的判定与构造；命中优先级与对象选择由各调用方保留。
 */

export {
  distanceSq,
  midpoint,
  pointInCircle,
  pointInPolygon,
  pointInRect,
  pointToSegmentDistanceSq,
  rectFromPoints,
  segmentIntersectsRect,
} from './impl/geometryUtils.js'
export type { Point, Rect } from './types.js'
