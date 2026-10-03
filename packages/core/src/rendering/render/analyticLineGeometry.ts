/**
 * 解析 AA 线条几何：把折线展开为带物理像素边距的逐段四边形（butt 端，无 miter join）。
 *
 * WebGL 与 WebGPU 共用此实现，所有线宽均走三角形解析 AA。
 * 输入为逻辑坐标与逻辑线宽，物理像素换算由各后端 shader 完成。
 */

/** 将逻辑坐标折线展开为解析 AA 三角形；每顶点为 x,y,edgeDist,edgeHalf，边距单位为物理像素。 */
export function buildAnalyticLineGeometry(
  points: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  dpr: number,
): Float32Array | null {
  if (
    points.length < 2 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(dpr) ||
    dpr <= 0
  ) {
    return null
  }
  const half = width * dpr * 0.5
  const extent = half + 1 // 每侧外扩一个物理像素，覆盖 shader 的过渡区域。
  const vertices = new Float32Array((points.length - 1) * 24)
  let offset = 0
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!
    const end = points[index + 1]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (
      !Number.isFinite(start.x) ||
      !Number.isFinite(start.y) ||
      !Number.isFinite(length) ||
      length <= 0
    )
      continue
    const nx = ((-dy / length) * extent) / dpr
    const ny = ((dx / length) * extent) / dpr
    vertices.set(
      [
        start.x + nx,
        start.y + ny,
        extent,
        half,
        start.x - nx,
        start.y - ny,
        -extent,
        half,
        end.x + nx,
        end.y + ny,
        extent,
        half,
        end.x + nx,
        end.y + ny,
        extent,
        half,
        start.x - nx,
        start.y - ny,
        -extent,
        half,
        end.x - nx,
        end.y - ny,
        -extent,
        half,
      ],
      offset,
    )
    offset += 24
  }
  return offset === 0 ? null : vertices.subarray(0, offset)
}
