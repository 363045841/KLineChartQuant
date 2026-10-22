/** Canvas 原语后端：共用同一套路径与文字解释器，矩形批次按视口剔除，数据空间填充缓存 Path2D。 */
import type { PaintPrimitive, PrimitiveBackend, PrimitivePath, PrimitiveSink } from '../types.js'

/** 视口尺寸（逻辑像素）。 */
interface ViewportBounds {
  readonly width: number
  readonly height: number
}

/** 数据空间填充的 Path2D 缓存：投影层按窗口分桶重新分配路径，引用相同即内容相同。 */
const dataSpacePaths = new WeakMap<readonly PrimitivePath[], Path2D>()

/**
 * 逐矩形剔除后提交。
 *
 * 矩形批次是唯一可能携带历史长度几何的原语：图表柱体、网格线都走它，批次内可能
 * 混有大量视口外的柱。GPU 后端有裁剪缓冲，Canvas 没有，每根 `fillRect` 都是真实的
 * 主线程调用，必须在提交前跳过。单形状与路径的提交量已由可见窗口投影限制，不做
 * 逐原语包围盒剔除，避免多一次全路径扫描，也不改变贴边几何的绘制结果。
 *
 * @param ctx      目标 2D 上下文
 * @param data     每 4 个数一个矩形：x、y、width、height
 * @param color    批次填充色
 * @param viewport 逻辑像素视口
 */
function paintRects(
  ctx: CanvasRenderingContext2D,
  data: Float64Array,
  color: string,
  viewport: ViewportBounds,
): void {
  ctx.fillStyle = color
  for (let offset = 0; offset < data.length; offset += 4) {
    const x = data[offset]!
    const y = data[offset + 1]!
    const width = data[offset + 2]!
    const height = data[offset + 3]!
    if (!(width > 0 && height > 0)) continue
    if (x + width < 0 || y + height < 0 || x > viewport.width || y > viewport.height) continue
    ctx.fillRect(x, y, width, height)
  }
}

/**
 * 取数据空间填充的 Path2D。
 *
 * 路径数组由投影层按窗口分桶分配，纯滚动期间引用不变，因此按数组引用缓存是安全的。
 * 缓存的是数据空间路径，滚动与价格轴缩放只改变换矩阵，不再逐点写路径。
 * 没有 Path2D 的环境（jsdom）返回 null，调用方退回逐点写路径。
 *
 * @param paths 数据空间路径集合（世界 x、价格 y）
 * @returns 可复用的 Path2D；环境不支持时为 null
 */
function cachedDataSpacePath(paths: readonly PrimitivePath[]): Path2D | null {
  if (typeof Path2D !== 'function') return null
  const cached = dataSpacePaths.get(paths)
  if (cached) return cached
  const path = new Path2D()
  for (const points of paths) {
    const first = points[0]
    if (!first) continue
    path.moveTo(first.x, first.y)
    for (let index = 1; index < points.length; index++) {
      const point = points[index]!
      path.lineTo(point.x, point.y)
    }
    path.closePath()
  }
  dataSpacePaths.set(paths, path)
  return path
}

/**
 * 把多轮廓路径写入当前路径对象；平移与价格映射只在写入时应用，不改动原路径。
 *
 * @param ctx      目标 2D 上下文
 * @param paths    逻辑像素路径集合
 * @param close    是否闭合每条轮廓
 * @param offsetX  世界坐标横向平移量
 * @param yScale   价格 → 纵坐标的线性系数
 * @param yOffset  价格 → 纵坐标的线性截距
 */
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

/**
 * 按批次顺序重放原语。
 *
 * 每个原语显式声明自己用到的状态（填充色、线宽、虚线、字体），因此整批只做一次
 * save/restore；旋转文字是唯一会改变坐标系的图元，单独包裹。外层声明的合成、
 * 阴影与裁剪保持调用方语义。
 */
export const paintCanvasPrimitives: PrimitiveSink = (ctx, primitives, dpr, transform) => {
  if (primitives.length === 0) return
  const scale = dpr > 0 ? dpr : 1
  const viewport: ViewportBounds = {
    width: ctx.canvas.width / scale,
    height: ctx.canvas.height / scale,
  }
  const baseAlpha = ctx.globalAlpha
  ctx.save()
  for (const primitive of primitives) {
    switch (primitive.kind) {
      case 'rects': {
        paintRects(ctx, primitive.data, primitive.color, viewport)
        break
      }
      case 'rect': {
        ctx.fillStyle = primitive.color
        if (primitive.radius) {
          ctx.beginPath()
          ctx.roundRect(
            primitive.x,
            primitive.y,
            primitive.width,
            primitive.height,
            primitive.radius,
          )
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
          ctx.lineJoin = 'miter'
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
        // 数据空间带子（世界 x、价格 y）在这里按帧变换还原屏幕坐标。
        const dataSpace = primitive.dataSpace === true && transform !== undefined
        ctx.fillStyle = primitive.color
        ctx.globalAlpha = baseAlpha * (primitive.opacity ?? 1)
        const drawPath = (offsetX: number, yScale: number, yOffset: number): void => {
          ctx.beginPath()
          appendPaths(ctx, primitive.paths, true, offsetX, yScale, yOffset)
          ctx.fill(primitive.fillRule ?? 'nonzero')
        }
        if (dataSpace) {
          const cached = cachedDataSpacePath(primitive.paths)
          if (cached) {
            // 缓存的是数据空间路径：滚动与价格轴缩放只改变换矩阵，不再逐点写路径。
            ctx.save()
            ctx.translate(-transform.offsetX, transform.yOffset)
            ctx.scale(1, transform.yScale)
            ctx.fill(cached, primitive.fillRule ?? 'nonzero')
            ctx.restore()
          } else drawPath(transform.offsetX, transform.yScale, transform.yOffset)
        } else drawPath(primitive.offsetX ?? 0, 1, 0)
        ctx.globalAlpha = baseAlpha
        break
      }
      case 'stroke': {
        ctx.beginPath()
        // 数据空间描边（世界 x、价格 y）在这里按帧变换还原屏幕坐标。
        // 描边不能像填充那样缓存 Path2D 再加缩放：纵向缩放会让 1px 线宽变成椭圆截面。
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

/** Canvas 后端直接消费原语，无 GPU 能力探测与业务侧回退。 */
export function createCanvasPrimitiveBackend(): PrimitiveBackend {
  let disposed = false
  return {
    paint(target, primitives, dpr, transform) {
      if (disposed) return false
      paintCanvasPrimitives(target, primitives, dpr, transform)
      return true
    },
    dispose() {
      disposed = true
    },
  }
}
