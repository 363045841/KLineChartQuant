/** 值轴刻度标签：直接消费帧内每轴算好的刻度，文本由列投影格式化。 */

import type { AxisLabel, AxisLabelScope, AxisLabelSource } from '../types.js'

export const ticksSource: AxisLabelSource = {
  collect(scope: AxisLabelScope): readonly AxisLabel[] {
    const labels: AxisLabel[] = []
    for (const spec of scope.axes) {
      if (!spec.visible) continue
      for (const tick of scope.axisTicks.get(spec.axisId) ?? [])
        labels.push({ kind: 'value', axisId: spec.axisId, role: 'tick', value: tick.value })
    }
    return labels
  },
}
