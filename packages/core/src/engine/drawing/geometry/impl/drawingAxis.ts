/** 绘图坐标归属解析：指标图元继承 owner 轴，不注册图元轴绑定。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneInfo } from '@/foundation/plugin/types.js'
import type { DrawingObject } from '../../types.js'

/** 指标输出按 owner 取轴，用户绘图读取文档投影的坐标归属；缺失归属不选择其他轴。 */
export function resolveDrawingRenderAxis(
  pane: Pick<PaneInfo, 'objectAxis'>,
  drawing: Pick<DrawingObject, 'id' | 'ownerId'>,
): string {
  const objectId = drawing.ownerId ?? drawing.id
  const axisId = pane.objectAxis(objectId)
  if (axisId === null)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_STATE,
      drawing.ownerId === undefined
        ? `绘图 ${drawing.id} 缺少坐标归属`
        : `绘图 ${drawing.id} 所属对象 ${drawing.ownerId} 未绑定轴`,
    )
  return axisId
}
