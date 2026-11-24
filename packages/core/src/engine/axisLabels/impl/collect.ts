/** 单帧收集：执行来源清单，按轴身份分桶，得到只读快照。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { PANE_LABEL_SOURCES, timeAxisSource } from '../sources/index.js'
import type { AxisLabel, AxisLabelScope, AxisLabelsFrame } from '../types.js'
import { TIME_AXIS } from '../types.js'
import { createAxisLabelsFrame } from './frame.js'

/** 标签归属的轴身份；时间轴标签固定归入唯一时间轴。 */
function axisOf(label: AxisLabel): string {
  return label.kind === 'time' ? TIME_AXIS : label.axisId
}

/** 写入分桶；值标签的目标轴必须存在，禁止把无效轴标签转投其他轴。 */
function pushLabel(
  buckets: Map<string, AxisLabel[]>,
  scope: AxisLabelScope,
  label: AxisLabel,
): void {
  const axisId = axisOf(label)
  if (label.kind === 'value' && !scope.pane.axes.some((axis) => axis.axisId === axisId))
    throw new KLineChartError(
      GENERIC_ERROR_CODES.NOT_REGISTERED,
      `Pane ${scope.pane.id} 中不存在标签目标轴 ${axisId}`,
    )
  const bucket = buckets.get(axisId)
  if (bucket) bucket.push(label)
  else buckets.set(axisId, [label])
}

/**
 * 收集一帧全部轴标签。
 *
 * Pane 来源按 scope 逐个执行；时间轴与 Pane 无关，只执行一次。
 *
 * @param scopes 本帧每个 Pane 的收集输入，顺序与 Pane 顺序一致
 * @returns 按轴身份分桶的全量快照
 */
export function collectAxisLabels(scopes: readonly AxisLabelScope[]): AxisLabelsFrame {
  const buckets = new Map<string, AxisLabel[]>()
  for (const scope of scopes) {
    for (const source of PANE_LABEL_SOURCES) {
      for (const label of source.collect(scope)) pushLabel(buckets, scope, label)
    }
  }
  const first = scopes[0]
  if (first) for (const label of timeAxisSource.collect(first)) pushLabel(buckets, first, label)
  return createAxisLabelsFrame(buckets)
}
