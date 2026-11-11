/** 非解析描边的屏幕投影：先变换端点，再以逻辑像素计算线宽、虚线和连接。 */
import type { DataTransform } from '@/foundation/plugin/types.js'
import type { PaintPrimitive, PrimitivePoint } from '../types.js'

type Stroke = Extract<PaintPrimitive, { kind: 'stroke' }>

/** 双精度合并局部原点，避免长历史、大价格和小价差在 Float32 中丢失精度。 */
export function rebaseDataTransform(
  transform: DataTransform | undefined,
  origin: PrimitivePoint,
): DataTransform | undefined {
  return (
    transform && {
      offsetX: transform.offsetX - origin.x,
      yScale: transform.yScale,
      yOffset: transform.yOffset + origin.y * transform.yScale,
    }
  )
}

/** 输出普通屏幕描边，变换只应用一次，原始数据路径保持不可变。 */
export function projectStrokeToScreen(stroke: Stroke, transform: DataTransform): Stroke {
  return {
    ...stroke,
    dataSpace: false,
    offsetX: 0,
    paths: stroke.paths.map((path) =>
      path.map((point) => ({
        x: point.x - transform.offsetX,
        y: point.y * transform.yScale + transform.yOffset,
      })),
    ),
  }
}
