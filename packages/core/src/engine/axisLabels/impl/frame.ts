/** 帧级轴标签聚合：按轴身份分桶的单帧只读快照。 */

import type { AxisLabel, AxisLabelsFrame } from '../types.js'

/** 空标签列表：缺失轴与无标签共用同一实例，避免到处判空。 */
const NO_LABELS: readonly AxisLabel[] = Object.freeze([])

/**
 * 由分桶结果构造帧快照。
 *
 * @param labels 轴身份 → 标签列表
 * @returns 只读帧快照
 */
export function createAxisLabelsFrame(
  labels: ReadonlyMap<string, readonly AxisLabel[]>,
): AxisLabelsFrame {
  return {
    forAxis: (axisId) => labels.get(axisId) ?? NO_LABELS,
  }
}
