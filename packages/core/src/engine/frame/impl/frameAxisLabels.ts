/** 绘图轴标签的来源合并：正式投影（静止图元）与会话投影（拖动中的图元）。 */

import type { AxisLabel } from '@/engine/axisLabels/index.js'
import type { DrawingFrameProjection } from '@/foundation/plugin/index.js'

/**
 * 当前生效的绘图轴标签。
 *
 * 拖动期间被拖图元会从正式投影中剔除，几何与标签只存在于会话投影；两者必须合并，
 * 否则轴标签会停在拖动前的位置。静止时会话投影为空，等价于只读正式投影。
 *
 * @param committed 正式投影
 * @param session 会话（拖拽预览）投影
 */
export function resolveDrawingLabels(
  committed: DrawingFrameProjection | undefined,
  session: DrawingFrameProjection | undefined,
): readonly AxisLabel[] {
  return [...(committed?.axisLabels ?? []), ...(session?.axisLabels ?? [])]
}
