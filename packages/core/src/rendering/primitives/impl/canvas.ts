/** Canvas 原语后端：所有业务层共用同一套路径和文字解释器。 */
import type { PrimitiveBackend, PrimitivePath, PrimitiveSink } from '../types.js'

/**
 * 按批次顺序重放原语。
 *
 * 每个原语显式声明自己用到的状态（填充色、线宽、虚线、字体），因此整批只做一次
 * save/restore；旋转文字是唯一会改变坐标系的图元，单独包裹。外层声明的合成、
 * 阴影与裁剪保持调用方语义。
 */
export const paintCanvasPrimitives: PrimitiveSink = (ctx, primitives, _dpr, transform) => {
  if (primitives.length === 0) return
  const baseAlpha = ctx.globalAlpha
  ctx.save()
  for (const primitive of primitives) {
    switch (primitive.kind) {
      case 'rects': {
        ctx.fillStyle = primitive.color
        const data = primitive.data
        for (let offset = 0; offset < data.length; offset += 4)
          ctx.fillRect(
            data[offset]!,
            data[offset + 1]!,
            data[offset + 2]!,
            data[offset + 3]!,
          )
        break
      }
      case 'rect': {
        ctx.fillStyle = primitive.color
        if (primitive.radius) {
          ctx.beginPath()
          ctx.roundRect(primitive.x, primitive.y, primitive.width, primitive.height, primitive.radius)
          ctx.fill()
        } else ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)
        if (primitive.strokeColor) {
          ctx.beginPath()
          if (primitive.radius)
            ctx.roundRect(
              primitive.x,
              primitive.y,
              primitive.width,
              primitive.height,
              primitive.radius,
            )
          else ctx.rect(primitive.x, primitive.y, primitive.width, primitive.height)
          ctx.strokeStyle = primitive.strokeColor
          ctx.lineWidth = primitive.strokeWidth ?? 1
          ctx.setLineDash([])
          ctx.lineJoin = 'miter'
          ctx.stroke()
        }
        break
      }
      case 'circle': {
        ctx.fillStyle = primitive.color
        ctx.beginPath()
        ctx.arc(primitive.x, primitive.y, primitive.radius, 0, Math.PI * 2)
        ctx.fill()
        if (primitive.strokeColor) {
          ctx.strokeStyle = primitive.strokeColor
          ctx.lineWidth = primitive.strokeWidth ?? 1
          ctx.setLineDash([])
          ctx.stroke()
        }
        break
      }
      case 'text': {
        ctx.font = primitive.font
        ctx.fillStyle = primitive.color
        ctx.textAlign = primitive.align
        ctx.textBaseline = primitive.baseline
        if (primitive.rotation === undefined) {
          ctx.fillText(primitive.text, primitive.x, primitive.y)
          break
        }
        ctx.save()
        ctx.translate(primitive.x, primitive.y)
        ctx.rotate(primitive.rotation)
        ctx.fillText(primitive.text, 0, primitive.offsetY ?? 0)
        ctx.restore()
        break
      }
      case 'fill': {
        ctx.beginPath()
        appendPaths(ctx, primitive.paths, true, primitive.offsetX ?? 0)
        ctx.fillStyle = primitive.color
        ctx.globalAlpha = baseAlpha * (primitive.opacity ?? 1)
        ctx.fill(primitive.fillRule ?? 'nonzero')
        ctx.globalAlpha = baseAlpha
        break
      }
      case 'stroke': {
        ctx.beginPath()
        // 数据空间描边（世界 x、价格 y）在这里按帧变换还原屏幕坐标。
        const dataSpace = primitive.dataSpace === true && transform !== undefined
        appendPaths(
          ctx,
          primitive.paths,
          primitive.closed === true,
          dataSpace ? transform.offsetX : (primitive.offsetX ?? 0),
          dataSpace ? transform.yScale : 1,
          dataSpace ? transform.yOffset : 0,
        )
        ctx.strokeStyle = primitive.color
        ctx.lineWidth = primitive.width
        ctx.lineCap = primitive.cap ?? 'butt'
        ctx.lineJoin = primitive.join ?? 'miter'
        ctx.miterLimit = primitive.miterLimit ?? 10
        ctx.setLineDash(primitive.dash === undefined ? [] : [...primitive.dash])
        ctx.lineDashOffset = primitive.dashOffset ?? 0
        ctx.stroke()
        break
      }
    }
  }
  ctx.restore()
}

/** 把多轮廓路径写入当前路径对象；平移与价格映射只在写入时应用，不改动原路径。 */
function appendPaths(
  ctx: CanvasRenderingContext2D,
  paths: readonly PrimitivePath[],
  close: boolean,
  offsetX = 0,
  yScale = 1,
  yOffset = 0,
): void {
  for (const path of paths) {
    const first = path[0]
    if (!first) continue
    ctx.moveTo(first.x - offsetX, first.y * yScale + yOffset)
    for (let index = 1; index < path.length; index++) {
      const point = path[index]!
      ctx.lineTo(point.x - offsetX, point.y * yScale + yOffset)
    }
    if (close) ctx.closePath()
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
    dispose() {
      disposed = true
    },
  }
}
