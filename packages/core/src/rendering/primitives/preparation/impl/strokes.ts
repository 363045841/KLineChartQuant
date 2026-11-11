/** 描边阶段：选择解析覆盖或屏幕三角化，独立管理段实例及其跨帧复用。 */
import { FloatArena } from '../../impl/buffers.js'
import type { ColorResolver, PrimitiveColor } from '../../impl/colors.js'
import { projectStrokeToScreen } from '../../impl/projection.js'
import { SEGMENT_FLAGS, SEGMENT_FLOATS } from '../../impl/shaders.js'
import {
  emitStrokePolygons,
  STROKE_REGION,
  type StrokeRegion,
  strokeRegion,
} from '../../impl/strokeRegions.js'
import type { PrimitivePath, PrimitivePoint } from '../../types.js'
import type { PreparationFrame, StrokePrimitive } from '../types.js'
import type { DrawList } from './drawList.js'
import { sameItems } from './reuse.js'

type StrokePlan =
  | { kind: 'mesh'; primitive: StrokePrimitive }
  | { kind: 'analytic'; primitive: StrokePrimitive; color: PrimitiveColor; region: StrokeRegion }
interface StrokeSpan {
  primitive: StrokePrimitive
  start: number
  count: number
}
interface SegmentStyle {
  x: number
  y: number
  half: number
  color: PrimitiveColor
  flags: number
}
const STYLE_FIELDS = [
  'color',
  'width',
  'closed',
  'cap',
  'join',
  'miterLimit',
  'dashOffset',
  'dataSpace',
] as const

/** 样式按值、只读路径按身份；数据空间横向偏移只在 uniform 中消费。 */
function sameStroke(a: StrokePrimitive, b: StrokePrimitive, dataSpace: boolean): boolean {
  return (
    STYLE_FIELDS.every((field) => a[field] === b[field]) &&
    (dataSpace || a.offsetX === b.offsetX) &&
    sameItems(a.paths, b.paths) &&
    sameItems(a.dash, b.dash)
  )
}

/** 重复点没有方向；取该端最近的不同点，端点没有邻段时沿用自身。 */
function neighbor(path: PrimitivePath, index: number, direction: -1 | 1): PrimitivePoint {
  const anchor = path[index]!
  for (let i = index + direction; i >= 0 && i < path.length; i += direction) {
    const point = path[i]!
    if (point.x !== anchor.x || point.y !== anchor.y) return point
  }
  return anchor
}

export class StrokeWriter {
  readonly arena = new FloatArena()
  private previous: Array<StrokeSpan | undefined> = []
  private current: Array<StrokeSpan | undefined> = []

  constructor(
    private readonly colors: ColorResolver,
    private readonly enabled: boolean,
    private readonly draws: DrawList,
  ) {}

  begin(reusable: boolean): void {
    this.previous = reusable ? this.current : []
    this.current = []
    this.arena.reset()
  }

  /** 先投影非解析数据描边，确保虚线与连接始终使用屏幕像素。 */
  resolve(source: StrokePrimitive, frame: PreparationFrame): StrokePlan {
    const color = this.colors(source.color)
    const sourceRegion = color[3] === 1 ? strokeRegion(source) : null
    const project =
      source.dataSpace === true &&
      frame.transform &&
      (!this.enabled || sourceRegion !== STROKE_REGION.capsule)
    const primitive = project ? projectStrokeToScreen(source, frame.transform!) : source
    const region =
      primitive === source ? sourceRegion : color[3] === 1 ? strokeRegion(primitive) : null
    return this.enabled && region !== null
      ? { kind: 'analytic', primitive, color, region }
      : { kind: 'mesh', primitive }
  }

  append(
    plan: Extract<StrokePlan, { kind: 'analytic' }>,
    frame: PreparationFrame,
    index: number,
  ): void {
    const { primitive, region, color } = plan
    const dataSpace = primitive.dataSpace === true && frame.transform !== undefined
    const cached = this.previous[index]
    if (
      cached &&
      this.arena.length === cached.start &&
      sameStroke(cached.primitive, primitive, dataSpace)
    ) {
      this.arena.skip(cached.count * SEGMENT_FLOATS)
      this.current[index] = cached
      this.draws.append(
        { kind: 'segments', first: cached.start / SEGMENT_FLOATS, count: cached.count },
        true,
      )
      return
    }
    const style: SegmentStyle = {
      x: dataSpace ? frame.origin.x : (primitive.offsetX ?? 0),
      y: dataSpace ? frame.origin.y : 0,
      half: region === STROKE_REGION.capsule ? primitive.width / 2 : 0,
      color,
      flags:
        (dataSpace ? SEGMENT_FLAGS.dataSpace : 0) +
        (region === STROKE_REGION.polygon ? SEGMENT_FLAGS.polygon : 0),
    }
    const first = this.arena.length / SEGMENT_FLOATS
    if (region === STROKE_REGION.capsule) this.appendCapsules(primitive, style)
    else emitStrokePolygons(primitive, (a, b, c, d) => this.write(a, b, c, d, style))
    const count = this.arena.length / SEGMENT_FLOATS - first
    if (count === 0) return
    this.current[index] = {
      start: first * SEGMENT_FLOATS,
      count,
      primitive: {
        ...primitive,
        paths: [...primitive.paths],
        dash: primitive.dash && [...primitive.dash],
      },
    }
    this.draws.append({ kind: 'segments', first, count }, true)
  }

  private appendCapsules(primitive: StrokePrimitive, style: SegmentStyle): void {
    for (const path of primitive.paths)
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!,
          b = path[i]!
        if (a.x === b.x && a.y === b.y) continue
        this.write(a, b, neighbor(path, i - 1, -1), neighbor(path, i, 1), style)
      }
  }

  /** 两种覆盖区域共享一个 GPU 布局，坐标编码只在此写入。 */
  private write(
    a: PrimitivePoint,
    b: PrimitivePoint,
    c: PrimitivePoint,
    d: PrimitivePoint,
    style: SegmentStyle,
  ): void {
    this.arena.reserve(SEGMENT_FLOATS)
    this.arena.write(a.x - style.x)
    this.arena.write(a.y - style.y)
    this.arena.write(b.x - style.x)
    this.arena.write(b.y - style.y)
    this.arena.write(c.x - style.x)
    this.arena.write(c.y - style.y)
    this.arena.write(d.x - style.x)
    this.arena.write(d.y - style.y)
    this.arena.write(style.half)
    for (const component of style.color) this.arena.write(component)
    this.arena.write(style.flags)
  }
}
