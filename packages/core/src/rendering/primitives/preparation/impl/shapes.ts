/** 形状实例准备：矩形逐根剔除，圆和圆角矩形共享布局，统一处理透明度。 */
import { FloatArena } from '../../impl/buffers.js'
import type { ColorResolver, PrimitiveColor } from '../../impl/colors.js'
import { INSTANCE_FLOATS } from '../../impl/shaders.js'
import type { PreparationFrame, ShapePrimitive } from '../types.js'
import type { DrawList } from './drawList.js'
import { outside, primitiveBounds } from './geometry.js'

export class ShapeWriter {
  readonly arena = new FloatArena()
  culled = 0

  constructor(
    private readonly colors: ColorResolver,
    private readonly draws: DrawList,
  ) {}

  begin(): void {
    this.arena.reset()
    this.culled = 0
  }

  /** flush 保证实例不会越过前面尚未提交的 stencil 路径。 */
  append(primitive: ShapePrimitive, frame: PreparationFrame, flush: () => void): void {
    if (primitive.kind === 'rects') {
      flush()
      this.appendRects(primitive, frame)
      return
    }
    if (outside(primitiveBounds(primitive, frame.dpr), frame)) {
      this.culled++
      return
    }
    const halfWidth = primitive.kind === 'circle' ? primitive.radius : Math.abs(primitive.width) / 2
    const halfHeight =
      primitive.kind === 'circle' ? primitive.radius : Math.abs(primitive.height) / 2
    if (!(halfWidth > 0 && halfHeight > 0)) return
    flush()
    const color = this.colors(primitive.color)
    const stroke = primitive.strokeColor ? this.colors(primitive.strokeColor) : color
    const first = this.arena.length / INSTANCE_FLOATS
    this.arena.reserve(INSTANCE_FLOATS)
    this.arena.write(primitive.kind === 'circle' ? primitive.x : primitive.x + primitive.width / 2)
    this.arena.write(primitive.kind === 'circle' ? primitive.y : primitive.y + primitive.height / 2)
    this.arena.write(halfWidth)
    this.arena.write(halfHeight)
    this.arena.write(
      primitive.kind === 'circle'
        ? primitive.radius
        : Math.max(0, Math.min(primitive.radius ?? 0, halfWidth, halfHeight)),
    )
    this.arena.write(primitive.strokeColor ? (primitive.strokeWidth ?? 1) : 0)
    this.arena.write(0)
    this.arena.write(0)
    this.writeColor(color, primitive.opacity ?? 1)
    this.writeColor(stroke, primitive.opacity ?? 1)
    this.draws.append({ kind: 'instances', first, count: 1 }, true)
  }

  private writeColor(color: PrimitiveColor, opacity: number): void {
    for (let i = 0; i < 4; i++) this.arena.write(color[i]! * (i === 3 ? opacity : 1))
  }

  private appendRects(
    primitive: Extract<ShapePrimitive, { kind: 'rects' }>,
    frame: PreparationFrame,
  ): void {
    const color = this.colors(primitive.color)
    const first = this.arena.length / INSTANCE_FLOATS
    for (let i = 0; i < primitive.data.length; i += 4) {
      const x = primitive.data[i]!,
        y = primitive.data[i + 1]!
      const width = primitive.data[i + 2]!,
        height = primitive.data[i + 3]!
      if (!(width > 0 && height > 0)) continue
      if (x + width < 0 || y + height < 0 || x > frame.width || y > frame.height) {
        this.culled++
        continue
      }
      this.arena.reserve(INSTANCE_FLOATS)
      this.arena.write(x + width / 2)
      this.arena.write(y + height / 2)
      this.arena.write(width / 2)
      this.arena.write(height / 2)
      for (let slot = 0; slot < 4; slot++) this.arena.write(0)
      this.writeColor(color, 1)
      this.writeColor(color, 1)
    }
    const count = this.arena.length / INSTANCE_FLOATS - first
    if (count > 0) this.draws.append({ kind: 'instances', first, count }, true)
  }
}
