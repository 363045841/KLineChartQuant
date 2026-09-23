/**
 * 默认 primitive 渲染器集合：把投影后的绘图 primitive 绘制到 Canvas2D。
 *
 * 线段/箭头裁剪依赖 geometry/impl/lineClipping 的纯几何函数。
 */

import {
  type DrawingStyle,
  POINT_ROLE,
  type ScreenPoint,
} from '../../../../foundation/plugin/index.js'
import { DEFAULT_DRAWING_STROKE, DRAWING_ANCHOR_FILL } from '../../../../foundation/tokens/index.js'
import { resolveLineLabelLayout } from '../../geometry/impl/labelLayout.js'
import { extendLineToViewport } from '../../geometry/impl/lineClipping.js'
import type { PrimitiveRendererSet } from '../types.js'

/** 按 DrawingStyle 设置线身描边样式（颜色/宽度/虚实）。 */
function applyLineStyle(ctx: CanvasRenderingContext2D, style?: DrawingStyle): void {
  ctx.strokeStyle = style?.stroke ?? DEFAULT_DRAWING_STROKE
  ctx.lineWidth = style?.strokeWidth ?? 1
  if (style?.strokeStyle === 'dashed') {
    ctx.setLineDash([6, 4])
    return
  }
  if (style?.strokeStyle === 'dotted') {
    ctx.setLineDash([2, 3])
    return
  }
  ctx.setLineDash([])
}

/** 按 DrawingStyle 设置填充样式（填充色/透明度）。 */
function applyFillStyle(ctx: CanvasRenderingContext2D, style?: DrawingStyle): void {
  ctx.fillStyle = style?.fill ?? style?.stroke ?? DEFAULT_DRAWING_STROKE
  ctx.globalAlpha = style?.fillOpacity ?? 1
}

/** 锚点与中点手柄的描边宽度（px）。 */
const ANCHOR_STROKE_WIDTH = 1
/** 线段中点垂直手柄的圆角半径（px）。 */
const HANDLE_CORNER_RADIUS = 2

/**
 * 绘制线段中点垂直手柄：以中点为心的圆角矩形，填白底、描图元颜色，指示这条线可沿价格轴平移。
 * 圆角只是让方块不显得生硬，整体仍是方形轮廓，与圆形锚点区分；描边宽度与锚点一致。
 */
function drawVerticalHandle(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  halfSize: number,
  style?: DrawingStyle,
): void {
  const radius = Math.min(HANDLE_CORNER_RADIUS, halfSize)
  ctx.strokeStyle = style?.stroke ?? DEFAULT_DRAWING_STROKE
  ctx.lineWidth = ANCHOR_STROKE_WIDTH
  // 手柄是交互提示，描边始终实线；图元的 strokeStyle 只作用于线身。
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.roundRect(point.x - halfSize, point.y - halfSize, halfSize * 2, halfSize * 2, radius)
  ctx.fillStyle = DRAWING_ANCHOR_FILL
  ctx.fill()
  ctx.stroke()
}

/** 判断屏幕点是否落在视口裁剪矩形内（含边界），线段端点据此决定是否绘制。 */
function isInsideViewport(
  point: ScreenPoint,
  clip: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    point.x >= clip.left && point.x <= clip.right && point.y >= clip.top && point.y <= clip.bottom
  )
}

/**
 * 绘制锚点：白底实心 + 图元色描边环，圆形，圆心即锚点。
 * 描边环是交互提示，始终实线，图元的 strokeStyle 只作用于线身。
 */
function drawAnchor(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  radius: number,
  style?: DrawingStyle,
): void {
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = DRAWING_ANCHOR_FILL
  ctx.fill()
  ctx.strokeStyle = style?.stroke ?? DEFAULT_DRAWING_STROKE
  ctx.lineWidth = ANCHOR_STROKE_WIDTH
  ctx.setLineDash([])
  ctx.stroke()
}

/** 将绘图文档中的字面量换行控制码拆为逻辑文本行。 */
function splitDrawingTextLines(text: string): string[] {
  return text.split('\\n')
}

/** 在当前坐标系绘制由字面量换行控制码分隔的多行文本，并保持原始基线语义。 */
function drawMultilineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  baseline: CanvasTextBaseline,
): void {
  const lines = splitDrawingTextLines(text)
  const lineHeight = fontSize * 1.2
  const height = lines.length * lineHeight
  const top = baseline === 'top' ? y : baseline === 'middle' ? y - height / 2 : y - height
  ctx.textBaseline = 'top'
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, x, top + index * lineHeight)
  }
}

/** 创建默认 primitive 渲染器集合。 */
export function createDefaultPrimitiveRendererSet(): PrimitiveRendererSet {
  return {
    point(ctx, primitive, dpr) {
      const radius = Math.max(primitive.style?.pointRadius ?? 4, 1 / dpr)
      ctx.save()
      if (primitive.role === POINT_ROLE['translate-handle']) {
        drawVerticalHandle(ctx, primitive.point, radius, primitive.style)
        ctx.restore()
        return
      }
      drawAnchor(ctx, primitive.point, radius, primitive.style)
      if (primitive.text) {
        ctx.fillStyle =
          primitive.style?.textColor ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        const align = primitive.text.align ?? 'center'
        ctx.textAlign = align
        drawMultilineText(
          ctx,
          primitive.text.text,
          primitive.point.x,
          primitive.point.y,
          primitive.style?.fontSize ?? 12,
          primitive.text.baseline ?? 'middle',
        )
      }
      ctx.restore()
    },

    line(ctx, primitive, viewportClip, dpr) {
      const clipped = extendLineToViewport(primitive, viewportClip)
      if (!clipped) return

      ctx.save()
      applyLineStyle(ctx, primitive.style)
      const lineWidth = primitive.style?.strokeWidth ?? 1
      const align = lineWidth <= 1 ? 0.5 / dpr : 0
      ctx.beginPath()
      ctx.moveTo(clipped.a.x + align, clipped.a.y + align)
      ctx.lineTo(clipped.b.x + align, clipped.b.y + align)
      ctx.stroke()

      if (primitive.text) {
        // 标签基于原始锚点，不随延长线或视口裁剪漂移。
        const textLayout = resolveLineLabelLayout(primitive.a, primitive.b, primitive.text.position)
        ctx.save()
        ctx.fillStyle =
          primitive.style?.textColor ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? textLayout.align
        const baseline = primitive.text.baseline ?? 'middle'
        ctx.translate(textLayout.x, textLayout.y)
        ctx.rotate(textLayout.rotation)
        drawMultilineText(ctx, primitive.text.text, 0, 0, primitive.style?.fontSize ?? 12, baseline)
        ctx.restore()
      }

      // 绘制端点（使用原始锚点位置，不是裁剪后的位置）；屏幕外锚点只保留被裁剪的线段。
      if (primitive.showEndpoints !== false) {
        const pointRadius = Math.max(primitive.style?.pointRadius ?? 4, 1 / dpr)
        for (const endpoint of [primitive.a, primitive.b]) {
          if (!isInsideViewport(endpoint, viewportClip)) continue
          drawAnchor(ctx, endpoint, pointRadius, primitive.style)
        }
      }

      ctx.restore()
    },

    area(ctx, primitive) {
      if (primitive.points.length === 0) return
      ctx.save()
      applyFillStyle(ctx, primitive.style)
      ctx.beginPath()
      ctx.moveTo(primitive.points[0]!.x, primitive.points[0]!.y)
      for (let i = 1; i < primitive.points.length; i++) {
        const point = primitive.points[i]!
        ctx.lineTo(point.x, point.y)
      }
      if (primitive.closed) {
        ctx.closePath()
      }
      ctx.fill()
      if (primitive.text) {
        const xs = primitive.points.map((point) => point.x)
        const ys = primitive.points.map((point) => point.y)
        // 文字在填充后绘制，始终位于填充带上层。
        ctx.globalAlpha = 1
        ctx.fillStyle =
          primitive.style?.textColor ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? 'center'
        const x = (Math.min(...xs) + Math.max(...xs)) / 2
        const y = (Math.min(...ys) + Math.max(...ys)) / 2
        drawMultilineText(
          ctx,
          primitive.text.text,
          x,
          y,
          primitive.style?.fontSize ?? 12,
          primitive.text.baseline ?? 'middle',
        )
      }
      ctx.restore()
    },

    text(ctx, primitive) {
      ctx.save()
      ctx.fillStyle =
        primitive.style?.textColor ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
      ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
      const align = primitive.align ?? 'left'
      ctx.textAlign = align
      drawMultilineText(
        ctx,
        primitive.text,
        primitive.point.x,
        primitive.point.y,
        primitive.style?.fontSize ?? 12,
        primitive.baseline ?? 'bottom',
      )
      ctx.restore()
    },

    arrow(ctx, primitive, dpr) {
      const angle = Math.atan2(
        primitive.end.y - primitive.start.y,
        primitive.end.x - primitive.start.x,
      )
      const headLength = primitive.headLength ?? 10
      const headAngle = primitive.headAngle ?? Math.PI / 6
      const left = {
        x: primitive.end.x - headLength * Math.cos(angle - headAngle),
        y: primitive.end.y - headLength * Math.sin(angle - headAngle),
      }
      const right = {
        x: primitive.end.x - headLength * Math.cos(angle + headAngle),
        y: primitive.end.y - headLength * Math.sin(angle + headAngle),
      }

      ctx.save()
      applyLineStyle(ctx, primitive.style)
      const lineWidth = primitive.style?.strokeWidth ?? 1
      const align = lineWidth <= 1 ? 0.5 / dpr : 0
      ctx.beginPath()
      ctx.moveTo(primitive.start.x + align, primitive.start.y + align)
      ctx.lineTo(primitive.end.x + align, primitive.end.y + align)
      ctx.stroke()

      ctx.fillStyle = primitive.style?.fill ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
      ctx.beginPath()
      ctx.moveTo(primitive.end.x, primitive.end.y)
      ctx.lineTo(left.x, left.y)
      ctx.lineTo(right.x, right.y)
      ctx.closePath()
      ctx.fill()
      if (primitive.text) {
        const textLayout = resolveLineLabelLayout(
          primitive.start,
          primitive.end,
          primitive.text.position,
        )
        ctx.fillStyle =
          primitive.style?.textColor ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? textLayout.align
        const baseline = primitive.text.baseline ?? 'middle'
        ctx.save()
        ctx.translate(textLayout.x, textLayout.y)
        ctx.rotate(textLayout.rotation)
        drawMultilineText(ctx, primitive.text.text, 0, 0, primitive.style?.fontSize ?? 12, baseline)
        ctx.restore()
      }
      ctx.restore()
    },
  }
}
