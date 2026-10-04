/** 业务绘制投影的版本：显式数据输入与横纵轴几何共同决定是否复用。 */
import type { RenderContext } from '../../../foundation/plugin/index.js'
import type { ProjectionRevision } from '../types.js'

/** 捕获会改变几何的轴输入；主题与 scrollLeft 由每帧重放消费。 */
export function createProjectionRevision(
  context: RenderContext,
  inputs: readonly unknown[],
): ProjectionRevision {
  const axis = context.pane.yAxis
  const range = axis.getDisplayRange()
  return {
    inputs: [
      ...inputs,
      context.data.length,
      context.range.start,
      context.range.end,
      context.kWidth,
      context.kGap,
      context.kWidthPx,
      context.dpr,
      context.pane.height,
      range.minPrice,
      range.maxPrice,
      axis.getPaddingTop(),
      axis.getPaddingBottom(),
      axis.getScaleType(),
    ],
    centers: [...context.kLineCenters],
  }
}

/** 比较投影版本，避免每帧重新分配的横轴数组使缓存失效。 */
export function sameProjectionRevision(
  previous: ProjectionRevision,
  next: ProjectionRevision,
): boolean {
  return (
    previous.inputs.length === next.inputs.length &&
    previous.inputs.every((value, index) => Object.is(value, next.inputs[index])) &&
    previous.centers.length === next.centers.length &&
    previous.centers.every((value, index) => value === next.centers[index])
  )
}
