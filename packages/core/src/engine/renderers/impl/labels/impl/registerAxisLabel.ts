/** 标签写入 API：Y 表面必须明确指定已存在的轴，X 表面使用图表唯一时间轴。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { AxisLabel, AxisLabelSurface, RenderContext } from '@/foundation/plugin/types.js'

type LabelContext = Pick<RenderContext, 'axisLabels' | 'pane'>

import type { AxisLabelRegistrar } from '../types.js'
/** 校验在提交前执行，禁止把无效轴的标签转投其他轴。 */
export const registerAxisLabel: AxisLabelRegistrar = (
  context: LabelContext,
  surface: AxisLabelSurface,
  label: AxisLabel,
  axisId?: string,
): void => {
  if (surface.startsWith('y')) {
    if (axisId === undefined || !context.pane.axes.some((axis) => axis.axisId === axisId))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.NOT_REGISTERED,
        `Pane ${context.pane.id} 中不存在标签目标轴 ${String(axisId)}`,
      )
  }
  context.axisLabels.forSurface(surface, axisId).register(label)
}
