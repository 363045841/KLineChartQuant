/** Canvas 原语后端：所有业务层共用同一套路径和文字解释器。 */
import type { PaintPrimitive, PrimitiveBackend, PrimitiveSink } from '../types.js'

/** 按批次顺序重放原语；外层负责目标坐标变换和裁剪。 */
export const paintCanvasPrimitives: PrimitiveSink = (ctx, primitives) => {
  for (const primitive of primitives) {
    ctx.save()
    if (primitive.kind === 'rect') {
      ctx.fillStyle = primitive.color
      if (primitive.radius) {
        ctx.beginPath(); ctx.roundRect(primitive.x, primitive.y, primitive.width, primitive.height, primitive.radius); ctx.fill()
      } else ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)
    } else if (primitive.kind === 'circle') {
      ctx.fillStyle = primitive.color
      ctx.beginPath(); ctx.arc(primitive.x, primitive.y, primitive.radius, 0, Math.PI * 2); ctx.fill()
    } else if (primitive.kind === 'text') {
      ctx.font = primitive.font
      ctx.fillStyle = primitive.color
      ctx.textAlign = primitive.align
      ctx.textBaseline = primitive.baseline
      if (primitive.rotation !== undefined) {
        ctx.translate(primitive.x, primitive.y)
        ctx.rotate(primitive.rotation)
        ctx.fillText(primitive.text, 0, primitive.offsetY ?? 0)
      } else ctx.fillText(primitive.text, primitive.x, primitive.y)
    } else {
      ctx.beginPath()
      for (const path of primitive.paths) {
        const first = path[0]
        if (!first) continue
        ctx.moveTo(first.x, first.y)
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i]!.x, path[i]!.y)
        if (primitive.kind === 'fill' || primitive.closed) ctx.closePath()
      }
      if (primitive.kind === 'fill') {
        ctx.fillStyle = primitive.color
        ctx.globalAlpha *= primitive.opacity ?? 1
        ctx.fill(primitive.fillRule ?? 'nonzero')
      } else {
        ctx.strokeStyle = primitive.color
        ctx.lineWidth = primitive.width
        ctx.lineCap = primitive.cap ?? 'butt'
        ctx.lineJoin = primitive.join ?? 'miter'
        ctx.miterLimit = primitive.miterLimit ?? 10
        ctx.setLineDash([...primitive.dash ?? []])
        ctx.lineDashOffset = primitive.dashOffset ?? 0
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

/** Canvas 后端直接消费原语，无 GPU 能力探测与业务侧回退。 */
export function createCanvasPrimitiveBackend(): PrimitiveBackend {
  let disposed = false
  return {
    paint(target, primitives, dpr) {
      if (disposed) return false
      paintCanvasPrimitives(target, primitives, dpr)
      return true
    },
    dispose() { disposed = true },
  }
}
