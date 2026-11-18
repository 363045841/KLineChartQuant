/** 绘图坐标归属解析：指标图元继承 owner 轴，不注册图元轴绑定。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneInfo } from '@/foundation/plugin/types.js'
import type { DrawingObject } from '../../types.js'

/** 指标输出按 owner 取轴，用户绘图直接使用窗格的主右轴。 */
export function resolveDrawingRenderAxis(
  pane: Pick<PaneInfo, 'axes' | 'objectAxis'>,
  drawing: Pick<DrawingObject, 'id' | 'ownerId'>,
): string {
  const axisId =
    drawing.ownerId === undefined ? pane.axes[0]?.axisId : pane.objectAxis(drawing.ownerId)
  if (axisId == null)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_STATE,
      drawing.ownerId === undefined
        ? `绘图 ${drawing.id} 所在窗格缺少主右轴`
        : `绘图 ${drawing.id} 所属对象 ${drawing.ownerId} 未绑定轴`,
    )
  return axisId
}
