/**
 * 轴标签模块唯一公开入口。
 *
 * 契约在 `./types.ts`，实现按职责分布在 `impl/`，来源清单在 `sources/`。
 * 模块外只允许依赖本文件。
 */

export { collectAxisLabels } from './impl/collect.js'
export { createValueProjection } from './impl/format.js'
export { measureAxisLabels } from './impl/measure.js'
export { paintAxisLabels } from './impl/paint.js'
export type {
  AxisColumn,
  AxisColumnPalette,
  AxisColumnProjection,
  AxisLabel,
  AxisLabelScope,
  AxisLabelSource,
  AxisLabelsFrame,
  TimeAxisLabel,
  ValueAxisLabel,
} from './types.js'
export { TIME_AXIS } from './types.js'
