/** 轴列宽度估算：与绘制共用同一文本解析与尺寸常量。 */

import type { AxisColumnProjection, AxisLabel } from '../types.js'
import { resolveLabelLines } from './layout.js'
import { AXIS_LABEL_FONT_SIZE, AXIS_LABEL_SIDE_PADDING } from './metrics.js'
import { measureAxisText } from './text.js'

/**
 * 估算一条值轴列所需的宽度。
 *
 * @param labels 该列的全部标签
 * @param projection 该列的投影，用于把值格式化为文本
 * @returns 所需列宽（逻辑像素）
 */
export function measureAxisLabels(
  labels: readonly AxisLabel[],
  projection: AxisColumnProjection,
): number {
  let widest = 0
  for (const label of labels) {
    for (const line of resolveLabelLines(label, projection)) {
      widest = Math.max(widest, measureAxisText(line, AXIS_LABEL_FONT_SIZE))
    }
  }
  return Math.ceil(widest + AXIS_LABEL_SIDE_PADDING)
}
