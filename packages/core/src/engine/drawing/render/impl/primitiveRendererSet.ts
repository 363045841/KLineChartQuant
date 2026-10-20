/**
 * 默认 primitive 渲染器集合：把投影后的绘图 primitive 绘制到 Canvas2D。
 *
 * 线段/箭头裁剪依赖 geometry/impl/lineClipping 的纯几何函数。
 */

import { type Point, pointInRect, type Rect } from '@/foundation/geometry/index.js'
import { type DrawingStyle, POINT_ROLE } from '@/foundation/plugin/index.js'
import { DEFAULT_DRAWING_STROKE, DRAWING_ANCHOR_FILL } from '@/foundation/tokens/index.js'
import {
  ARROW_HEAD_ANGLE,
  ARROW_HEAD_LENGTH,
  arrowHead,
} from '../../geometry/impl/arrowGeometry.js'
import { resolveAreaLabelLayout, resolveLineLabelLayout } from '../../geometry/impl/labelLayout.js'
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
  point: Point,
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
function isInsideViewport(point: Point, clip: Rect): boolean {
  return pointInRect(point, clip)
}

/**
 * 绘制锚点：白底实心 + 图元色描边环，圆形，圆心即锚点。
 * 描边环是交互提示，始终实线，图元的 strokeStyle 只作用于线身。
 */
function drawAnchor(
  ctx: CanvasRenderingContext2D,
  point: Point,
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
      strokeSegment(ctx, clipped.a, clipped.b, primitive.style, dpr)
      if (primitive.text)
        drawLineText(ctx, primitive.a, primitive.b, primitive.text, primitive.style)
      drawStrokeArrowHeads(ctx, clipped, primitive.style)
      // 端点使用原始锚点位置，不是裁剪后的位置；屏幕外锚点只保留被裁剪的线段。
      if (primitive.showEndpoints !== false) drawEndpoints(ctx, primitive, viewportClip, dpr)
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
        const layout = resolveAreaLabelLayout(
          Math.min(...xs),
          Math.max(...xs),
          primitive.text.position,
        )
        // 文字在填充后绘制，始终位于填充带上层。
        ctx.globalAlpha = 1
        ctx.fillStyle =
          primitive.style?.textColor ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? layout.align
        const x = layout.x
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
      ctx.save()
      strokeSegment(ctx, primitive.start, primitive.end, primitive.style, dpr)
      const head = arrowHead(
        primitive.start,
        primitive.end,
        primitive.headLength ?? ARROW_HEAD_LENGTH,
        primitive.headAngle ?? ARROW_HEAD_ANGLE,
      )
      ctx.fillStyle = primitive.style?.fill ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE
      ctx.beginPath()
      ctx.moveTo(primitive.end.x, primitive.end.y)
      ctx.lineTo(head.left.x, head.left.y)
      ctx.lineTo(head.right.x, head.right.y)
      ctx.closePath()
      ctx.fill()
      if (primitive.text)
        drawLineText(ctx, primitive.start, primitive.end, primitive.text, primitive.style)
      ctx.restore()
    },
  }
}

/** 线身文字的最小形状；与 LinePrimitive.text 一致。 */
type LineTextLayoutInput = {
  readonly text: string
  readonly position?: 'start' | 'center' | 'end'
  readonly align?: CanvasTextAlign
  readonly baseline?: CanvasTextBaseline
}

/** 含端点开关的最小线图元形状。 */
type LineEndpointSource = {
  readonly a: Point
  readonly b: Point
  readonly showEndpoints?: boolean
  readonly style?: DrawingStyle
}

/** 按 dpr 对齐并描一条线；线宽 ≤1 时用半像素偏移避免发虚。 */
function strokeSegment(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  style: DrawingStyle | undefined,
  dpr: number,
): void {
  applyLineStyle(ctx, style)
  const lineWidth = style?.strokeWidth ?? 1
  const align = lineWidth <= 1 ? 0.5 / dpr : 0
  ctx.beginPath()
  ctx.moveTo(a.x + align, a.y + align)
  ctx.lineTo(b.x + align, b.y + align)
  ctx.stroke()
}

/** 沿线身绘制标签；位置基于原始锚点，不随裁剪漂移。 */
function drawLineText(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  text: LineTextLayoutInput,
  style?: DrawingStyle,
): void {
  const layout = resolveLineLabelLayout(from, to, text.position)
  ctx.save()
  ctx.fillStyle = style?.textColor ?? style?.stroke ?? DEFAULT_DRAWING_STROKE
  ctx.font = `${style?.fontSize ?? 12}px sans-serif`
  ctx.textAlign = text.align ?? layout.align
  ctx.translate(layout.x, layout.y)
  ctx.rotate(layout.rotation)
  drawMultilineText(ctx, text.text, 0, 0, style?.fontSize ?? 12, text.baseline ?? 'middle')
  ctx.restore()
}

/** 线型箭头：在两端描开放的两翼。 */
function drawStrokeArrowHeads(
  ctx: CanvasRenderingContext2D,
  segment: { readonly a: Point; readonly b: Point },
  style: DrawingStyle | undefined,
): void {
  const strokeStyle = style?.strokeStyle
  const arrowLeft = strokeStyle === 'arrow_left' || strokeStyle === 'arrow_both'
  const arrowRight = strokeStyle === 'arrow_right' || strokeStyle === 'arrow_both'
  if (!arrowLeft && !arrowRight) return
  ctx.setLineDash([])
  const length = Math.max(8, (style?.strokeWidth ?? 1) * 3)
  const { angle } = arrowHead(segment.a, segment.b, length)
  if (arrowLeft) strokeArrowWing(ctx, segment.a, angle + Math.PI, length)
  if (arrowRight) strokeArrowWing(ctx, segment.b, angle, length)
}

/** 描一组箭头两翼。 */
function strokeArrowWing(
  ctx: CanvasRenderingContext2D,
  point: Point,
  angle: number,
  length: number,
): void {
  ctx.beginPath()
  ctx.moveTo(
    point.x - length * Math.cos(angle - ARROW_HEAD_ANGLE),
    point.y - length * Math.sin(angle - ARROW_HEAD_ANGLE),
  )
  ctx.lineTo(point.x, point.y)
  ctx.lineTo(
    point.x - length * Math.cos(angle + ARROW_HEAD_ANGLE),
    point.y - length * Math.sin(angle + ARROW_HEAD_ANGLE),
  )
  ctx.stroke()
}

/** 绘制线身端点；屏幕外锚点跳过。 */
function drawEndpoints(
  ctx: CanvasRenderingContext2D,
  primitive: LineEndpointSource,
  clip: Rect,
  dpr: number,
): void {
  const radius = Math.max(primitive.style?.pointRadius ?? 4, 1 / dpr)
  for (const endpoint of [primitive.a, primitive.b]) {
    if (!isInsideViewport(endpoint, clip)) continue
    drawAnchor(ctx, endpoint, radius, primitive.style)
  }
}
