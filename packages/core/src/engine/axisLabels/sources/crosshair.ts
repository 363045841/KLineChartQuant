/** 十字线价签：活动 Pane 的每条可见轴各出一条，钉在指针价格上。 */

import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { AxisLabel, AxisLabelScope, AxisLabelSource } from '../types.js'

export const crosshairSource: AxisLabelSource = {
  collect(scope: AxisLabelScope): readonly AxisLabel[] {
    const crosshair = scope.crosshair
    if (!scope.active || !crosshair) return []
    const colors = resolveThemeColors(
      scope.theme.theme,
      scope.theme.isAsiaMarket,
      scope.theme.colorPresetSettings,
    )
    const labels: AxisLabel[] = []
    for (const spec of scope.axes) {
      if (!spec.visible) continue
      const axis = scope.pane.axis(spec.axisId)
      // 十字线只在内容区内取价，视觉留白不参与。
      const localY = Math.max(
        axis.getContentTop(),
        Math.min(axis.getContentBottom(), crosshair.y - scope.pane.top),
      )
      labels.push({
        kind: 'value',
        axisId: spec.axisId,
        role: 'marker',
        value: axis.yToPrice(localY),
        background: colors.crosshairLabelBg,
      })
    }
    return labels
  },
}
