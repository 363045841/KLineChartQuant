/** 有序合批准备：提前剔除、缓存几何、实例化基础形状，复用 CPU 连续缓冲。 */
import type { DataTransform } from '@/foundation/plugin/types.js'
import type { PaintPrimitive, PrimitivePath, PrimitivePoint } from '../types.js'
import { FloatArena } from './buffers.js'
import { type CachedGeometry, GeometryCache, type PrimitiveBounds } from './cache.js'
import type { ColorResolver, PrimitiveColor } from './colors.js'
import { bandTriangles, pathTriangles, simpleStrokePath, strokePaths } from './geometry.js'
import { MESH_FLOATS, SEGMENT_FLAGS, SEGMENT_FLOATS } from './shaders.js'
import { emitStrokePolygons, STROKE_REGION, strokeRegion } from './strokeRegions.js'

export type GeometryPrimitive = Exclude<PaintPrimitive, { kind: 'text' }>

/** 一个解析形状实例的 float 数：中心、半宽高、圆角、线宽、占位、填充色、描边色。 */
const INSTANCE_FLOATS = 16
export type PreparedDraw =
  | { kind: 'instances'; first: number; count: number }
  | { kind: 'direct'; first: number; count: number }
  /** 解析式描边：count 为线段实例数，每段 6 个顶点在着色器里展开。 */
  | { kind: 'segments'; first: number; count: number }
  | {
      kind: 'stencil'
      first: number
      count: number
      coverFirst: number
      coverCount: number
      evenodd: boolean
    }

/** 数据空间填充的一次顶点写入范围；整段可直接跳到上一帧的位置。 */
interface FillSpan {
  readonly start: number
  readonly floats: number
  readonly draw: PreparedDraw
}
export interface PreparedBatch {
  vertices: Float32Array
  instances: Float32Array
  segments: Float32Array
  draws: PreparedDraw[]
  /** 本批各类缓冲是否被重写；false 表示可直接复用上一帧的 GPU 内容。 */
  changed: { vertices: boolean; instances: boolean; segments: boolean }
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
function bounds(primitive: GeometryPrimitive, dpr: number, offsetX = 0): PrimitiveBounds {
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
  } else if (primitive.kind === 'rects') {
    const data = primitive.data
    for (let offset = 0; offset < data.length; offset += 4) {
      const x = data[offset]!,
        y = data[offset + 1]!,
        width = data[offset + 2]!,
        height = data[offset + 3]!
      left = Math.min(left, x)
      right = Math.max(right, x + width)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y + height)
    }
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
    top: top - expand,
    right: right + expand - offsetX,
    bottom: bottom + expand,
  }
}

/** 用共享几何函数构建一次 tessellation，颜色和平移不参与几何失效。 */
function buildGeometry(
  primitive: Extract<GeometryPrimitive, { kind: 'fill' | 'stroke' }>,
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
    // 带子由上下两条等长链组成：按段展开成零重叠条带，避免扇形三角化互相覆盖。
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

/** 判断两段描边是否产出完全相同的实例数据：路径按引用比较，样式按值比较。 */
function sameStroke(
  a: Extract<GeometryPrimitive, { kind: 'stroke' }>,
  b: Extract<GeometryPrimitive, { kind: 'stroke' }>,
): boolean {
  if (
    a.color !== b.color ||
    a.width !== b.width ||
    a.closed !== b.closed ||
    a.cap !== b.cap ||
    a.join !== b.join ||
    a.miterLimit !== b.miterLimit ||
    a.dashOffset !== b.dashOffset ||
    a.offsetX !== b.offsetX ||
    a.dataSpace !== b.dataSpace ||
    a.paths.length !== b.paths.length
  )
    return false
  const dashA = a.dash,
    dashB = b.dash
  if (dashA !== dashB) {
    if (!dashA || !dashB || dashA.length !== dashB.length) return false
    for (let i = 0; i < dashA.length; i++) if (dashA[i] !== dashB[i]) return false
  }
  // 投影层会复用同一批点数组；引用相同即可跳过整段实例重写。
  for (let i = 0; i < a.paths.length; i++) if (a.paths[i] !== b.paths[i]) return false
  return true
}

/** 判断两段填充是否产出完全相同的顶点：路径按引用比较，样式按值比较。 */
function sameFill(
  a: Extract<GeometryPrimitive, { kind: 'fill' }>,
  b: Extract<GeometryPrimitive, { kind: 'fill' }>,
): boolean {
  if (
    a.color !== b.color ||
    a.opacity !== b.opacity ||
    a.fillRule !== b.fillRule ||
    a.band !== b.band ||
    a.dataSpace !== b.dataSpace ||
    a.paths.length !== b.paths.length
  )
    return false
  // 投影层只在数据或窗口分桶变化时重新分配路径；引用相同即可整段复用。
  for (let i = 0; i < a.paths.length; i++) if (a.paths[i] !== b.paths[i]) return false
  return true
}

/** 创建后端级准备器；缓存和容量在全部 paint 调用之间保留。 */
export function createPrimitivePreparer(
  resolveColor: ColorResolver,
  options: { segments?: boolean } = {},
) {
  const segmentStrokes = options.segments === true
  const geometryCache = new GeometryCache()
  const mesh = new FloatArena(),
    instances = new FloatArena(),
    segmentArena = new FloatArena()
  const draws: PreparedDraw[] = []
  let lastPrimitives: readonly GeometryPrimitive[] | undefined
  let lastSegments: Array<{ start: number; count: number } | undefined> = []
  let lastFills: Array<FillSpan | undefined> = []
  return {
    prepare(
      primitives: readonly GeometryPrimitive[],
      width: number,
      height: number,
      dpr: number,
      transform?: DataTransform,
    ): PreparedBatch {
      mesh.reset()
      instances.reset()
      segmentArena.reset()
      draws.length = 0
      // 上一次调用的段布局用于复用；本次写入记录到新的数组，结束后再替换。
      const previousSegments = lastSegments
      const currentSegments: Array<{ start: number; count: number } | undefined> = []
      const previousFills = lastFills
      const currentFills: Array<FillSpan | undefined> = []
      let wroteVertices = false,
        wroteInstances = false,
        wroteSegments = false
      geometryCache.beginBatch()
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
      /** 最近一段可继续合并的直绘；数据空间带子独占 draw，不能被后续原语并进去。 */
      let directRun: PreparedDraw | undefined
      /** 顶点颜色直接携带，不因颜色变化而拆分兼容的直绘批次。 */
      function vertex(
        x: number,
        y: number,
        color: PrimitiveColor,
        opacity: number,
        mode = 0,
      ): void {
        wroteVertices = true
        // 顶点保留逻辑像素：屏幕几何原样写入，数据空间几何由着色器先变换再归一化。
        mesh.write(x)
        mesh.write(y)
        mesh.write(color[0])
        mesh.write(color[1])
        mesh.write(color[2])
        mesh.write(color[3] * opacity)
        // mode=1 表示顶点是数据空间（世界 x、价格 y），由着色器按帧变换还原。
        mesh.write(mode)
      }
      /** 不相交的相邻 stencil 对象可以先累计 mask，再统一 cover；相交对象强制保持独立顺序。 */
      function flush(): void {
        if (!pending.length) return
        const first = mesh.length / MESH_FLOATS
        for (const item of pending) {
          mesh.reserve((item.geometry.positions.length / 2) * MESH_FLOATS)
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
          mesh.reserve(6 * MESH_FLOATS)
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
      for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
        const primitive = primitives[primitiveIndex]!
        // 矩形批次自带逐矩形裁剪，不做整批包围盒；图表投影端已按视口裁剪，
        // 这里保留逐根判定兜住其他生产者的原始批次。
        if (primitive.kind === 'rects') {
          flush()
          const data = primitive.data
          const color = resolveColor(primitive.color)
          const first = instances.length / INSTANCE_FLOATS
          let count = 0
          for (let offset = 0; offset < data.length; offset += 4) {
            const x = data[offset]!,
              y = data[offset + 1]!,
              width = data[offset + 2]!,
              height = data[offset + 3]!
            if (!(width > 0 && height > 0)) continue
            if (x + width < 0 || y + height < 0 || x > viewportWidth || y > viewportHeight) {
              culled++
              continue
            }
            instances.reserve(INSTANCE_FLOATS)
            wroteInstances = true
            instances.write(x + width / 2)
            instances.write(y + height / 2)
            instances.write(width / 2)
            instances.write(height / 2)
            instances.write(0)
            instances.write(0)
            instances.write(0)
            instances.write(0)
            for (const component of color) instances.write(component)
            for (const component of color) instances.write(component)
            count++
          }
          if (count > 0) {
            const last = draws.at(-1)
            if (last?.kind === 'instances') last.count += count
            else draws.push({ kind: 'instances', first, count })
          }
          continue
        }
        const dataSpace =
          primitive.kind === 'fill' &&
          primitive.band === true &&
          primitive.dataSpace === true &&
          transform !== undefined
        const offsetX = dataSpace
          ? transform!.offsetX
          : primitive.kind === 'stroke' || primitive.kind === 'fill'
            ? (primitive.offsetX ?? 0)
            : 0
        if (segmentStrokes && primitive.kind === 'stroke') {
          const color = resolveColor(primitive.color)
          // 数据空间折线只在缓冲里保留世界坐标与价格，滚动和轴缩放都改 uniform；
          // 其余描边仍在这里一次扣除横向偏移。
          const dataSpace = primitive.dataSpace === true && transform !== undefined
          // 不透明描边的宽度、端帽与连接都由着色器按距离还原；半透明描边在共享切边上
          // 会二次混合，仍走三角化与 stencil。
          const region = color[3] === 1 ? strokeRegion(primitive) : null
          if (region !== null) {
            flush()
            // 同一批原语在滚动/轴缩放时引用不变：直接跳过实例重写，只推进游标。
            const previous = lastPrimitives?.[primitiveIndex]
            const cached = previousSegments[primitiveIndex]
            if (
              cached &&
              previous?.kind === 'stroke' &&
              sameStroke(previous, primitive) &&
              segmentArena.length === cached.start
            ) {
              segmentArena.skip(cached.count * SEGMENT_FLOATS)
              currentSegments[primitiveIndex] = cached
              const last = draws.at(-1)
              if (last?.kind === 'segments') last.count += cached.count
              else
                draws.push({
                  kind: 'segments',
                  first: cached.start / SEGMENT_FLOATS,
                  count: cached.count,
                })
              continue
            }
            const first = segmentArena.length / SEGMENT_FLOATS
            let count = 0
            const half = primitive.width / 2
            const shift = dataSpace ? 0 : offsetX
            const flags =
              (dataSpace ? SEGMENT_FLAGS.dataSpace : 0) +
              (region === STROKE_REGION.polygon ? SEGMENT_FLAGS.polygon : 0)
            if (region === STROKE_REGION.capsule) {
              for (const path of primitive.paths)
                for (let i = 1; i < path.length; i++) {
                  const a = path[i - 1]!,
                    b = path[i]!
                  // 退化线段没有方向，着色器无法展开。
                  if (a.x === b.x && a.y === b.y) continue
                  // 相邻段的真实端点参与并集距离与角平分面；重复点没有方向，取最近的不同点。
                  let prev = a
                  for (let j = i - 2; j >= 0; j--) {
                    const point = path[j]!
                    if (point.x !== a.x || point.y !== a.y) {
                      prev = point
                      break
                    }
                  }
                  let next = b
                  for (let j = i + 1; j < path.length; j++) {
                    const point = path[j]!
                    if (point.x !== b.x || point.y !== b.y) {
                      next = point
                      break
                    }
                  }
                  segmentArena.reserve(SEGMENT_FLOATS)
                  segmentArena.write(a.x - shift)
                  segmentArena.write(a.y)
                  segmentArena.write(b.x - shift)
                  segmentArena.write(b.y)
                  segmentArena.write(prev.x - shift)
                  segmentArena.write(prev.y)
                  segmentArena.write(next.x - shift)
                  segmentArena.write(next.y)
                  segmentArena.write(half)
                  for (const component of color) segmentArena.write(component)
                  // 数据空间标记与区域种类共用一个标志位字段，避免中途改 uniform。
                  segmentArena.write(flags)
                  count++
                }
            } else {
              // 四边形互不重叠，自带线宽，半宽写 0、数据空间标记恒为 0。
              emitStrokePolygons(primitive, (corner0, corner1, corner2, corner3) => {
                segmentArena.reserve(SEGMENT_FLOATS)
                segmentArena.write(corner0.x - shift)
                segmentArena.write(corner0.y)
                segmentArena.write(corner1.x - shift)
                segmentArena.write(corner1.y)
                segmentArena.write(corner2.x - shift)
                segmentArena.write(corner2.y)
                segmentArena.write(corner3.x - shift)
                segmentArena.write(corner3.y)
                segmentArena.write(0)
                for (const component of color) segmentArena.write(component)
                segmentArena.write(flags)
                count++
              })
            }
            if (count > 0) {
              wroteSegments = true
              currentSegments[primitiveIndex] = { start: first * SEGMENT_FLOATS, count }
              const last = draws.at(-1)
              if (last?.kind === 'segments') last.count += count
              else draws.push({ kind: 'segments', first, count })
            }
            continue
          }
        }
        // 解析式描边逐段处理，包围盒只服务三角化与实例的剔除。
        // 数据空间带子由 uniform 变换，不能按价格 y 做屏幕包围盒剔除。
        const box = dataSpace ? undefined : bounds(primitive, dpr, offsetX)
        if (
          box &&
          (box.right < 0 ||
            box.bottom < 0 ||
            box.left > viewportWidth ||
            box.top > viewportHeight ||
            box.right < box.left)
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
          wroteInstances = true
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
        // 数据空间带子的路径与样式不变时，直接跳到上一帧写好的顶点段。
        const reusable = dataSpace && primitive.kind === 'fill'
        const previousFill = reusable ? previousFills[primitiveIndex] : undefined
        const previousPrimitive = reusable ? lastPrimitives?.[primitiveIndex] : undefined
        if (
          previousFill &&
          previousPrimitive?.kind === 'fill' &&
          primitive.kind === 'fill' &&
          sameFill(previousPrimitive, primitive) &&
          mesh.length === previousFill.start
        ) {
          flush()
          mesh.skip(previousFill.floats)
          draws.push(previousFill.draw)
          currentFills[primitiveIndex] = previousFill
          continue
        }
        /**
         * 不透明描边直接栅格化三角形：轮廓之间重叠不会改变颜色，因此不需要 stencil，
         * 也就不会为整条线段的包围盒铺一次全幅 cover（多指标时的主要填充开销）。
         */
        if (geometry.direct || (primitive.kind === 'stroke' && color[3] === 1)) {
          flush()
          const first = mesh.length / MESH_FLOATS
          mesh.reserve((geometry.positions.length / 2) * MESH_FLOATS)
          const shift = dataSpace ? 0 : offsetX
          for (let i = 0; i < geometry.positions.length; i += 2)
            vertex(
              geometry.positions[i]! + cached.x - shift,
              geometry.positions[i + 1]! + cached.y,
              color,
              opacity,
              dataSpace ? 1 : 0,
            )
          const count = geometry.positions.length / 2
          const draw: PreparedDraw = { kind: 'direct', first, count }
          // 数据空间带子独占一个 draw，复用才能精确跳回同一段顶点。
          if (dataSpace) {
            draws.push(draw)
            directRun = undefined
            currentFills[primitiveIndex] = {
              start: first * MESH_FLOATS,
              floats: count * MESH_FLOATS,
              draw,
            }
          } else if (directRun && draws.at(-1) === directRun) {
            directRun.count += count
          } else {
            draws.push(draw)
            directRun = draw
          }
        } else {
          const evenodd = primitive.kind === 'fill' && primitive.fillRule === 'evenodd'
          const actual = {
            left: geometry.bounds.left + cached.x - offsetX,
            top: geometry.bounds.top + cached.y,
            right: geometry.bounds.right + cached.x - offsetX,
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
          pending.push({ geometry, x: cached.x - offsetX, y: cached.y, color, opacity })
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
      lastPrimitives = primitives
      lastSegments = currentSegments
      lastFills = currentFills
      return {
        vertices: mesh.view(),
        instances: instances.view(),
        segments: segmentArena.view(),
        draws,
        changed: {
          vertices: wroteVertices,
          instances: wroteInstances,
          segments: wroteSegments,
        },
        culled,
        geometryBuilds,
        geometryHits,
      }
    },
  }
}
