/** 对象坐标绑定契约；对象身份决定独有轴，Pane 只决定坐标容器。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { RenderGeometryContext } from '../plugin/types.js'
import { ScaleType } from '../types/scaleType.js'

export interface ObjectAxisBinding {
  readonly objectId: string
  readonly paneId: string
  readonly axisId: string
}

/** 稳定轴身份与容器位置无关；对象迁移不重新分配轴。 */
export function objectAxisId(objectId: string): string {
  if (objectId.length === 0)
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '轴所属对象身份不能为空')
  return `object:${objectId}`
}

/** 显式绑定当前绘制坐标；不存在的轴由 Pane API 抛出异常。 */
export function bindRenderAxis<T extends RenderGeometryContext>(context: T, axisId: string): T {
  const axis = context.pane.axis(axisId)
  const dataTransform =
    axis.getScaleType() === ScaleType.Linear
      ? {
          offsetX: context.scrollLeft,
          yOffset: axis.priceToY(0),
          yScale: axis.priceToY(1) - axis.priceToY(0),
        }
      : undefined
  const pane = context.pane
  return {
    ...context,
    axisId,
    pane: {
      id: pane.id,
      top: pane.top,
      height: pane.height,
      capabilities: pane.capabilities,
      axes: pane.axes,
      axis: (id: string) => pane.axis(id),
      yAxis: axis,
      priceRange: axis.getDisplayRange(),
    },
    dataTransform,
  }
}
