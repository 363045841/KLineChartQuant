/** 有序合批准备：提前剔除、缓存几何、实例化基础形状，复用 CPU 连续缓冲。 */
import type { PaintPrimitive, PrimitivePath } from '../types.js'
import { FloatArena } from './buffers.js'
import { type CachedGeometry, GeometryCache, type PrimitiveBounds } from './cache.js'
import type { ColorResolver, PrimitiveColor } from './colors.js'
import { pathTriangles, simpleStrokePath, strokePaths } from './geometry.js'

export type GeometryPrimitive = Exclude<PaintPrimitive, { kind: 'text' }>
export type PreparedDraw =
  | { kind: 'instances'; first: number; count: number }
  | { kind: 'direct'; first: number; count: number }
  | {
      kind: 'stencil'
      first: number
      count: number
      coverFirst: number
      coverCount: number
      evenodd: boolean
    }
export interface PreparedBatch {
  vertices: Float32Array
  instances: Float32Array
  draws: PreparedDraw[]
  culled: number
  geometryBuilds: number
  geometryHits: number
}

/** 仅对至多十六点的简单凸多边形启用直绘；半平面检查同时排除自交星形。 */
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

/** 求原始包围盒，描边按 miter 上限扩展；GPU 裁剪前就排除完全不可见对象。 */
function bounds(primitive: GeometryPrimitive, dpr: number): PrimitiveBounds {
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
  return { left: left - expand, top: top - expand, right: right + expand, bottom: bottom + expand }
}

/** 用共享几何函数构建一次 tessellation，颜色和平移不参与几何失效。 */
function buildGeometry(
  primitive: Extract<GeometryPrimitive, { kind: 'fill' | 'stroke' }>,
  paths: PrimitivePath[],
  dpr: number,
): CachedGeometry {
  let direct = false,
    outlines: readonly PrimitivePath[]
  if (primitive.kind === 'stroke') {
    const simple = simpleStrokePath({ ...primitive, paths }, dpr)
    direct = simple !== null
    outlines = simple ?? strokePaths({ ...primitive, paths }, dpr)
  } else {
    outlines = paths
    direct = paths.length === 1 && convex(paths[0]!)
  }
  const triangles = pathTriangles(outlines)
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

/** 创建后端级准备器；缓存和容量在全部 paint 调用之间保留。 */
export function createPrimitivePreparer(resolveColor: ColorResolver) {
  const geometryCache = new GeometryCache()
  const mesh = new FloatArena(),
    instances = new FloatArena()
  const draws: PreparedDraw[] = []
  return {
    prepare(
      primitives: readonly GeometryPrimitive[],
      width: number,
      height: number,
      dpr: number,
    ): PreparedBatch {
      mesh.reset()
      instances.reset()
      draws.length = 0
      let culled = 0,
        geometryBuilds = 0,
        geometryHits = 0
      const viewportWidth = width / dpr,
        viewportHeight = height / dpr
      const pending: Array<{
        geometry: CachedGeometry
        x: number
        y: number
        color: PrimitiveColor
        opacity: number
      }> = []
      let pendingBounds: PrimitiveBounds | undefined
      let parity = false
      /** 顶点颜色直接携带，不因颜色变化而拆分兼容的直绘批次。 */
      function vertex(x: number, y: number, color: PrimitiveColor, opacity: number): void {
        mesh.write((x / viewportWidth) * 2 - 1)
        mesh.write(1 - (y / viewportHeight) * 2)
        mesh.write(color[0])
        mesh.write(color[1])
        mesh.write(color[2])
        mesh.write(color[3] * opacity)
      }
      /** 不相交的相邻 stencil 对象可以先累计 mask，再统一 cover；相交对象强制保持独立顺序。 */
      function flush(): void {
        if (!pending.length) return
        const first = mesh.length / 6
        for (const item of pending) {
          mesh.reserve(item.geometry.positions.length * 3)
          for (let i = 0; i < item.geometry.positions.length; i += 2)
            vertex(
              item.geometry.positions[i]! + item.x,
              item.geometry.positions[i + 1]! + item.y,
              item.color,
              item.opacity,
            )
        }
        const coverFirst = mesh.length / 6
        for (const item of pending) {
          const box = item.geometry.bounds
          const x = Math.max(0, box.left + item.x),
            y = Math.max(0, box.top + item.y)
          const right = Math.min(viewportWidth, box.right + item.x),
            bottom = Math.min(viewportHeight, box.bottom + item.y)
          mesh.reserve(36)
          vertex(x, y, item.color, item.opacity)
          vertex(right, y, item.color, item.opacity)
          vertex(right, bottom, item.color, item.opacity)
          vertex(x, y, item.color, item.opacity)
          vertex(right, bottom, item.color, item.opacity)
          vertex(x, bottom, item.color, item.opacity)
        }
        draws.push({
          kind: 'stencil',
          first,
          count: coverFirst - first,
          coverFirst,
          coverCount: pending.length * 6,
          evenodd: parity,
        })
        pending.length = 0
        pendingBounds = undefined
      }
      for (const primitive of primitives) {
        const box = bounds(primitive, dpr)
        if (
          box.right < 0 ||
          box.bottom < 0 ||
          box.left > viewportWidth ||
          box.top > viewportHeight ||
          box.right < box.left
        ) {
          culled++
          continue
        }
        if (primitive.kind === 'circle' || primitive.kind === 'rect') {
          flush()
          const halfWidth =
            primitive.kind === 'circle' ? primitive.radius : Math.abs(primitive.width) / 2
          const halfHeight =
            primitive.kind === 'circle' ? primitive.radius : Math.abs(primitive.height) / 2
          if (!(halfWidth > 0 && halfHeight > 0)) continue
          const centerX =
            primitive.kind === 'circle' ? primitive.x : primitive.x + primitive.width / 2
          const centerY =
            primitive.kind === 'circle' ? primitive.y : primitive.y + primitive.height / 2
          const radius =
            primitive.kind === 'circle'
              ? primitive.radius
              : Math.max(0, Math.min(primitive.radius ?? 0, halfWidth, halfHeight))
          const color = resolveColor(primitive.color)
          const stroke = primitive.strokeColor ? resolveColor(primitive.strokeColor) : color
          const strokeWidth = primitive.strokeColor ? (primitive.strokeWidth ?? 1) : 0
          const first = instances.length / 16
          instances.reserve(16)
          instances.write(centerX)
          instances.write(centerY)
          instances.write(halfWidth)
          instances.write(halfHeight)
          instances.write(radius)
          instances.write(strokeWidth)
          instances.write(0)
          instances.write(0)
          for (const component of color) instances.write(component)
          for (const component of stroke) instances.write(component)
          const last = draws.at(-1)
          if (last?.kind === 'instances') last.count++
          else draws.push({ kind: 'instances', first, count: 1 })
          continue
        }
        const style =
          primitive.kind === 'fill'
            ? `fill/${primitive.fillRule ?? 'nonzero'}`
            : `stroke/${primitive.width}/${primitive.closed === true}/${primitive.cap ?? 'butt'}/${primitive.join ?? 'miter'}/${primitive.miterLimit ?? 10}/${primitive.dashOffset ?? 0}/${primitive.dash?.join(',') ?? ''}`
        const cached = geometryCache.read(`${dpr}/${style}`, primitive.paths, (paths) =>
          buildGeometry(primitive, paths, dpr),
        )
        if (cached.hit) geometryHits++
        else geometryBuilds++
        const geometry = cached.geometry
        if (!geometry.positions.length) continue
        const color = resolveColor(primitive.color),
          opacity = primitive.kind === 'fill' ? (primitive.opacity ?? 1) : 1
        if (geometry.direct) {
          flush()
          const first = mesh.length / 6
          mesh.reserve(geometry.positions.length * 3)
          for (let i = 0; i < geometry.positions.length; i += 2)
            vertex(
              geometry.positions[i]! + cached.x,
              geometry.positions[i + 1]! + cached.y,
              color,
              opacity,
            )
          const last = draws.at(-1),
            count = geometry.positions.length / 2
          if (last?.kind === 'direct') last.count += count
          else draws.push({ kind: 'direct', first, count })
        } else {
          const evenodd = primitive.kind === 'fill' && primitive.fillRule === 'evenodd'
          const actual = {
            left: geometry.bounds.left + cached.x,
            top: geometry.bounds.top + cached.y,
            right: geometry.bounds.right + cached.x,
            bottom: geometry.bounds.bottom + cached.y,
          }
          const overlaps =
            pendingBounds &&
            !(
              actual.right < pendingBounds.left ||
              actual.left > pendingBounds.right ||
              actual.bottom < pendingBounds.top ||
              actual.top > pendingBounds.bottom
            )
          if (pending.length && (overlaps || parity !== evenodd)) flush()
          parity = evenodd
          pending.push({ geometry, x: cached.x, y: cached.y, color, opacity })
          pendingBounds = pendingBounds
            ? {
                left: Math.min(pendingBounds.left, actual.left),
                top: Math.min(pendingBounds.top, actual.top),
                right: Math.max(pendingBounds.right, actual.right),
                bottom: Math.max(pendingBounds.bottom, actual.bottom),
              }
            : actual
        }
      }
      flush()
      return {
        vertices: mesh.view(),
        instances: instances.view(),
        draws,
        culled,
        geometryBuilds,
        geometryHits,
      }
    },
  }
}
