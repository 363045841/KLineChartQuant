/** 网格阶段：缓存三角化、复用数据填充，并保持透明 stencil 的覆盖顺序。 */
import { FloatArena } from '../../impl/buffers.js'
import { type CachedGeometry, GeometryCache, type PrimitiveBounds } from '../../impl/cache.js'
import type { ColorResolver, PrimitiveColor } from '../../impl/colors.js'
import { MESH_FLOATS } from '../../impl/shaders.js'
import type { PrimitiveFade } from '../../types.js'
import type { FillPrimitive, PathPrimitive, PreparationFrame, PreparedDraw } from '../types.js'
import type { DrawList } from './drawList.js'
import { buildGeometry, outside, primitiveBounds } from './geometry.js'
import { sameItems } from './reuse.js'

interface FillSpan {
  primitive: FillPrimitive
  start: number
  floats: number
  draw: PreparedDraw
}
interface MeshItem {
  geometry: CachedGeometry
  x: number
  y: number
  color: PrimitiveColor
  opacity: number
  fade?: PrimitiveFade
}
interface VertexStyle {
  color: PrimitiveColor
  opacity: number
  mode: number
  fade?: PrimitiveFade
}
const FILL_FIELDS = ['color', 'opacity', 'fillRule', 'band', 'dataSpace'] as const

function sameFill(a: FillPrimitive, b: FillPrimitive): boolean {
  return (
    FILL_FIELDS.every((field) => a[field] === b[field]) &&
    a.fade?.fromY === b.fade?.fromY &&
    a.fade?.toY === b.fade?.toY &&
    sameItems(a.paths, b.paths)
  )
}

export class MeshWriter {
  readonly arena = new FloatArena()
  culled = 0
  geometryBuilds = 0
  geometryHits = 0
  private readonly cache = new GeometryCache()
  private previous: Array<FillSpan | undefined> = []
  private current: Array<FillSpan | undefined> = []
  private readonly pending: MeshItem[] = []
  private pendingBounds: PrimitiveBounds | undefined
  private parity = false

  constructor(
    private readonly colors: ColorResolver,
    private readonly draws: DrawList,
  ) {}

  begin(reusable: boolean): void {
    this.previous = reusable ? this.current : []
    this.current = []
    this.arena.reset()
    this.cache.beginBatch()
    this.culled = this.geometryBuilds = this.geometryHits = 0
    this.pending.length = 0
    this.pendingBounds = undefined
  }

  append(primitive: PathPrimitive, frame: PreparationFrame, index: number): void {
    const dataSpace =
      primitive.kind === 'fill' &&
      primitive.band === true &&
      primitive.dataSpace === true &&
      frame.transform !== undefined
    const offsetX = dataSpace ? frame.transform!.offsetX : (primitive.offsetX ?? 0)
    if (!dataSpace && outside(primitiveBounds(primitive, frame.dpr, offsetX), frame)) {
      this.culled++
      return
    }
    if (dataSpace && primitive.kind === 'fill' && this.reuseFill(primitive, frame, index)) return
    const style =
      primitive.kind === 'fill'
        ? `fill/${primitive.fillRule ?? 'nonzero'}`
        : `stroke/${primitive.width}/${primitive.closed === true}/${primitive.cap ?? 'butt'}/${primitive.join ?? 'miter'}/${primitive.miterLimit ?? 10}/${primitive.dashOffset ?? 0}/${primitive.dash?.join(',') ?? ''}`
    const cached = this.cache.read(`${frame.dpr}/${style}`, primitive.paths, (paths) =>
      buildGeometry(primitive, paths, frame.dpr),
    )
    if (cached.hit) this.geometryHits++
    else this.geometryBuilds++
    if (!cached.geometry.positions.length) return
    const item: MeshItem = {
      geometry: cached.geometry,
      x: cached.x,
      y: cached.y,
      color: this.colors(primitive.color),
      opacity: primitive.kind === 'fill' ? (primitive.opacity ?? 1) : 1,
      fade: primitive.kind === 'fill' ? primitive.fade : undefined,
    }
    if (item.geometry.direct || (primitive.kind === 'stroke' && item.color[3] === 1)) {
      this.flush(frame)
      const first = this.arena.length / MESH_FLOATS
      const vertexStyle: VertexStyle = {
        color: item.color,
        opacity: item.opacity,
        mode: dataSpace ? 1 : 0,
        fade: item.fade,
      }
      this.writeGeometry(
        item,
        vertexStyle,
        dataSpace ? frame.origin.x : offsetX,
        dataSpace ? frame.origin.y : 0,
      )
      const draw: PreparedDraw = {
        kind: 'direct',
        first,
        count: item.geometry.positions.length / 2,
      }
      this.draws.append(draw, !dataSpace)
      if (dataSpace && primitive.kind === 'fill')
        this.current[index] = {
          primitive: {
            ...primitive,
            paths: [...primitive.paths],
            fade: primitive.fade && { ...primitive.fade },
          },
          start: first * MESH_FLOATS,
          floats: draw.count * MESH_FLOATS,
          draw,
        }
    } else
      this.queueStencil(
        { ...item, x: item.x - offsetX },
        primitive.kind === 'fill' && primitive.fillRule === 'evenodd',
        frame,
      )
  }

  /** 在路径哈希之前复用；独立 draw 的范围不参与相邻直绘合并。 */
  private reuseFill(primitive: FillPrimitive, frame: PreparationFrame, index: number): boolean {
    this.flush(frame)
    const cached = this.previous[index]
    if (!cached || this.arena.length !== cached.start || !sameFill(cached.primitive, primitive))
      return false
    this.arena.skip(cached.floats)
    this.draws.append(cached.draw)
    this.current[index] = cached
    return true
  }

  private queueStencil(item: MeshItem, evenodd: boolean, frame: PreparationFrame): void {
    const box = item.geometry.bounds
    const actual = {
      left: box.left + item.x,
      right: box.right + item.x,
      top: box.top + item.y,
      bottom: box.bottom + item.y,
    }
    const previous = this.pendingBounds
    const overlaps =
      previous &&
      !(
        actual.right < previous.left ||
        actual.left > previous.right ||
        actual.bottom < previous.top ||
        actual.top > previous.bottom
      )
    if (this.pending.length && (overlaps || this.parity !== evenodd)) this.flush(frame)
    this.parity = evenodd
    this.pending.push(item)
    const bounds = this.pendingBounds
    this.pendingBounds = bounds
      ? {
          left: Math.min(bounds.left, actual.left),
          right: Math.max(bounds.right, actual.right),
          top: Math.min(bounds.top, actual.top),
          bottom: Math.max(bounds.bottom, actual.bottom),
        }
      : actual
  }

  /** 不相交且同 fillRule 的轮廓共享 mask/cover；其他原语必须先触发此屏障。 */
  flush(frame: PreparationFrame): void {
    if (!this.pending.length) return
    const first = this.arena.length / MESH_FLOATS
    for (const item of this.pending)
      this.writeGeometry(item, { color: item.color, opacity: item.opacity, mode: 0 }, 0, 0)
    const coverFirst = this.arena.length / MESH_FLOATS
    for (const item of this.pending) {
      const box = item.geometry.bounds
      const x = Math.max(0, box.left + item.x),
        y = Math.max(0, box.top + item.y)
      const right = Math.min(frame.width, box.right + item.x),
        bottom = Math.min(frame.height, box.bottom + item.y)
      const style: VertexStyle = {
        color: item.color,
        opacity: item.opacity,
        mode: 0,
        fade: item.fade,
      }
      this.arena.reserve(6 * MESH_FLOATS)
      this.vertex(x, y, style)
      this.vertex(right, y, style)
      this.vertex(right, bottom, style)
      this.vertex(x, y, style)
      this.vertex(right, bottom, style)
      this.vertex(x, bottom, style)
    }
    this.draws.append({
      kind: 'stencil',
      first,
      count: coverFirst - first,
      coverFirst,
      coverCount: this.pending.length * 6,
      evenodd: this.parity,
    })
    this.pending.length = 0
    this.pendingBounds = undefined
  }

  private writeGeometry(
    item: MeshItem,
    style: VertexStyle,
    offsetX: number,
    offsetY: number,
  ): void {
    const positions = item.geometry.positions
    this.arena.reserve((positions.length / 2) * MESH_FLOATS)
    for (let i = 0; i < positions.length; i += 2)
      this.vertex(positions[i]! + item.x - offsetX, positions[i + 1]! + item.y - offsetY, style)
  }

  private vertex(x: number, y: number, style: VertexStyle): void {
    this.arena.write(x)
    this.arena.write(y)
    this.arena.write(style.color[0])
    this.arena.write(style.color[1])
    this.arena.write(style.color[2])
    this.arena.write(style.color[3] * style.opacity)
    this.arena.write(style.mode)
    this.arena.write(style.fade?.fromY ?? 0)
    this.arena.write(style.fade?.toY ?? 0)
  }
}
