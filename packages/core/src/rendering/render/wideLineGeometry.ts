/**
 * 粗线几何构建：把折线展开为逐段四边形（butt 端，不做 miter join）。
 *
 * WebGL 与 WebGPU 后端共用同一份实现，保证两个后端的粗线形状一致。
 * 输入为逻辑坐标与逻辑线宽，物理像素换算由各后端 shader 完成。
 */

/** 将折线展开为逐段四边形顶点；每段 6 个顶点（12 个 float），无有效段返回 null。 */
export function buildWideLineGeometry(
  points: ReadonlyArray<{ x: number; y: number }>,
  width: number,
): Float32Array | null {
  if (points.length < 2 || width <= 0) return null

  const maxFloats = (points.length - 1) * 12
  const vertices = new Float32Array(maxFloats)
  let offset = 0

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!
    const end = points[index + 1]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    if (length <= 0) continue
    const nx = (-dy / length) * width * 0.5
    const ny = (dx / length) * width * 0.5
    vertices.set(
      [
        start.x + nx,
        start.y + ny,
        start.x - nx,
        start.y - ny,
        end.x + nx,
        end.y + ny,
        end.x + nx,
        end.y + ny,
        start.x - nx,
        start.y - ny,
        end.x - nx,
        end.y - ny,
      ],
      offset,
    )
    offset += 12
  }

  if (offset === 0) return null
  return offset === maxFloats ? vertices : vertices.subarray(0, offset)
}
