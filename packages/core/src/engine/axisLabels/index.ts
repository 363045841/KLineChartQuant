/**
 * 轴标签管理模块唯一公开入口。
 *
 * 只做重导出：模块契约在 `./types.ts`，实现按职责分散在 `impl/` 下。
 * 模块外调用方依赖本文件，禁止指向内部实现路径。
 */

export {
  createAxisLabelsFrame,
  createXAxisLabelCollector,
  createYAxisLabelCollector,
} from './impl/axisLabelCollector.js'
export { registerYAxisLabel } from './impl/registerYAxisLabel.js'
export type {
  AxisLabelRegistrars,
  AxisLabelsFrame,
  XAxisLabelCollector,
  YAxisLabelCollector,
} from './types.js'
