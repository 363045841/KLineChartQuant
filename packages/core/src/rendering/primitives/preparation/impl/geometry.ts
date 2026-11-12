/** 几何准备的纯运算：包围盒、视口剔除与路径三角化，不持有跨帧状态。 */
import type { CachedGeometry, PrimitiveBounds } from '../../impl/cache.js'
import { bandTriangles, pathTriangles, simpleStrokePath, strokePaths } from '../../impl/geometry.js'
import type { PrimitivePath, PrimitivePoint } from '../../types.js'
import type { GeometryPrimitive, PathPrimitive, PreparationFrame } from '../types.js'

/** 小型凸轮廓可直接绘制；统一半平面判定同时排除自交图形。 */
function convex(path: PrimitivePath): boolean {
  if (path.length < 3 || path.length > 16) return false
  let orientation = 0
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!,
      b = path[(i + 1) % path.length]!
    for (const point of path) {
      const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
      if (Math.abs(cross) < 1e-10) continue
      const sign = Math.sign(cross)
      if (orientation && orientation !== sign) return false
      orientation = sign
    }
  }
  return orientation !== 0
}

/** 矩形批次自行逐根剔除；这里只接受可求单个包围盒的原语。 */
export function primitiveBounds(
  primitive: Exclude<GeometryPrimitive, { kind: 'rects' }>,
  dpr: number,
  offsetX = 0,
): PrimitiveBounds {
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity
  let expand = 1 / dpr
  if (primitive.kind === 'circle') {
    left = primitive.x - primitive.radius
    right = primitive.x + primitive.radius
    top = primitive.y - primitive.radius
    bottom = primitive.y + primitive.radius
    expand += (primitive.strokeWidth ?? 0) / 2
  } else if (primitive.kind === 'rect') {
    left = Math.min(primitive.x, primitive.x + primitive.width)
    right = Math.max(primitive.x, primitive.x + primitive.width)
    top = Math.min(primitive.y, primitive.y + primitive.height)
    bottom = Math.max(primitive.y, primitive.y + primitive.height)
    expand += (primitive.strokeWidth ?? 0) / 2
  } else {
    for (const path of primitive.paths)
      for (const point of path) {
        left = Math.min(left, point.x)
        right = Math.max(right, point.x)
        top = Math.min(top, point.y)
        bottom = Math.max(bottom, point.y)
      }
    if (primitive.kind === 'stroke')
      expand +=
        (primitive.width / 2) *
        ((primitive.join ?? 'miter') === 'miter' ? (primitive.miterLimit ?? 10) : 1)
  }
  return {
    left: left - expand - offsetX,
    right: right + expand - offsetX,
    top: top - expand,
    bottom: bottom + expand,
  }
}

/** 保留与原准备器相同的边界包含规则。 */
export function outside(box: PrimitiveBounds, frame: PreparationFrame): boolean {
  return box.right < 0 || box.bottom < 0 || box.left > frame.width || box.top > frame.height
}

/** 平移已由缓存归一化，三角化仅依赖路径和描边样式。 */
export function buildGeometry(
  primitive: PathPrimitive,
  paths: PrimitivePath[],
  dpr: number,
): CachedGeometry {
  let direct = false
  let triangles: PrimitivePoint[]
  if (primitive.kind === 'stroke') {
    const simple = simpleStrokePath({ ...primitive, paths }, dpr)
    direct = simple !== null
    triangles = pathTriangles(simple ?? strokePaths({ ...primitive, paths }, dpr))
  } else if (primitive.band === true) {
    triangles = paths.flatMap((path) => bandTriangles(path))
    direct = true
  } else {
    triangles = pathTriangles(paths)
    direct = paths.length === 1 && convex(paths[0]!)
  }
  const positions = new Float64Array(triangles.length * 2)
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity
  for (let i = 0; i < triangles.length; i++) {
    const point = triangles[i]!
    positions[i * 2] = point.x
    positions[i * 2 + 1] = point.y
    left = Math.min(left, point.x)
    right = Math.max(right, point.x)
    top = Math.min(top, point.y)
    bottom = Math.max(bottom, point.y)
  }
  return { positions, direct, bounds: { left, right, top, bottom } }
}
