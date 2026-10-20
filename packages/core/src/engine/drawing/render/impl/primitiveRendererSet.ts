/** drawing 投影到公共屏幕原语；不持有 Canvas 状态或后端资源。 */
import { type Point, pointInRect } from '@/foundation/geometry/index.js'
import { type DrawingStyle, POINT_ROLE } from '@/foundation/plugin/index.js'
import { DEFAULT_DRAWING_STROKE, DRAWING_ANCHOR_FILL } from '@/foundation/tokens/index.js'
import { paintCanvasPrimitives } from '@/rendering/primitives/impl/canvas.js'
import type { PaintPrimitive, PrimitiveSink } from '@/rendering/primitives/types.js'
import {
  ARROW_HEAD_ANGLE,
  ARROW_HEAD_LENGTH,
  arrowHead,
} from '../../geometry/impl/arrowGeometry.js'
import { resolveAreaLabelLayout, resolveLineLabelLayout } from '../../geometry/impl/labelLayout.js'
import { extendLineToViewport } from '../../geometry/impl/lineClipping.js'
import type { PrimitiveRendererSet } from '../types.js'

/** 图元线型只作用于线身，锚点和箭头翼保持实线。 */
function line(a: Point, b: Point, style: DrawingStyle | undefined, dpr: number): PaintPrimitive {
  const width = style?.strokeWidth ?? 1
  const align = width <= 1 ? 0.5 / dpr : 0
  return {
    kind: 'stroke',
    paths: [
      [
        { x: a.x + align, y: a.y + align },
        { x: b.x + align, y: b.y + align },
      ],
    ],
    color: style?.stroke ?? DEFAULT_DRAWING_STROKE,
    width,
    dash: style?.strokeStyle === 'dashed' ? [6, 4] : style?.strokeStyle === 'dotted' ? [2, 3] : [],
  }
}

/** 锚点的填充与描边作为同一实例提交，多个选中对象共享基础形状批次。 */
function anchor(
  point: Point,
  style: DrawingStyle | undefined,
  dpr: number,
  handle = false,
): PaintPrimitive[] {
  const radius = Math.max(style?.pointRadius ?? 4, 1 / dpr)
  const paint = {
    color: DRAWING_ANCHOR_FILL,
    strokeColor: style?.stroke ?? DEFAULT_DRAWING_STROKE,
    strokeWidth: 1,
  }
  return [
    handle
      ? {
          kind: 'rect',
          x: point.x - radius,
          y: point.y - radius,
          width: radius * 2,
          height: radius * 2,
          radius: Math.min(2, radius),
          ...paint,
        }
      : { kind: 'circle', x: point.x, y: point.y, radius, ...paint },
  ]
}

/** 按文档的字面量换行码排多行文字，保留已有块基线语义。 */
function text(
  value: string,
  x: number,
  y: number,
  style: DrawingStyle | undefined,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  rotation?: number,
): PaintPrimitive[] {
  const lines = value.split('\\n')
  const size = style?.fontSize ?? 12,
    lineHeight = size * 1.2,
    height = lines.length * lineHeight
  const top = baseline === 'top' ? 0 : baseline === 'middle' ? -height / 2 : -height
  return lines.map((value, index) => {
    const offset = top + index * lineHeight
    return {
      kind: 'text',
      text: value,
      x,
      y: rotation === undefined ? y + offset : y,
      font: `${size}px sans-serif`,
      color: style?.textColor ?? style?.stroke ?? DEFAULT_DRAWING_STROKE,
      align,
      baseline: 'top',
      rotation,
      offsetY: rotation === undefined ? undefined : offset,
    }
  })
}

/** 沿原始锚点定位标签，裁剪或延伸不改变标签的语义位置。 */
function lineText(
  a: Point,
  b: Point,
  attachment: {
    text: string
    position?: 'start' | 'center' | 'end'
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
  },
  style?: DrawingStyle,
): PaintPrimitive[] {
  const layout = resolveLineLabelLayout(a, b, attachment.position)
  return text(
    attachment.text,
    layout.x,
    layout.y,
    style,
    attachment.align ?? layout.align,
    attachment.baseline ?? 'middle',
    layout.rotation,
  )
}

/** 以尖端为中心产生开放箭头翼。 */
function wing(point: Point, angle: number, length: number, style?: DrawingStyle): PaintPrimitive {
  return {
    kind: 'stroke',
    width: style?.strokeWidth ?? 1,
    color: style?.stroke ?? DEFAULT_DRAWING_STROKE,
    paths: [
      [
        {
          x: point.x - length * Math.cos(angle - ARROW_HEAD_ANGLE),
          y: point.y - length * Math.sin(angle - ARROW_HEAD_ANGLE),
        },
        point,
        {
          x: point.x - length * Math.cos(angle + ARROW_HEAD_ANGLE),
          y: point.y - length * Math.sin(angle + ARROW_HEAD_ANGLE),
        },
      ],
    ],
  }
}

/** 创建纯投影适配器；提交器决定使用三后端中的哪一个。 */
export function createDefaultPrimitiveRendererSet(
  submit: PrimitiveSink = paintCanvasPrimitives,
): PrimitiveRendererSet {
  return {
    point(ctx, primitive, dpr) {
      const commands = anchor(
        primitive.point,
        primitive.style,
        dpr,
        primitive.role === POINT_ROLE['translate-handle'],
      )
      if (primitive.text && primitive.role !== POINT_ROLE['translate-handle'])
        commands.push(
          ...text(
            primitive.text.text,
            primitive.point.x,
            primitive.point.y,
            primitive.style,
            primitive.text.align ?? 'center',
            primitive.text.baseline ?? 'middle',
          ),
        )
      submit(ctx, commands, dpr)
    },
    line(ctx, primitive, clip, dpr) {
      const clipped = extendLineToViewport(primitive, clip)
      if (!clipped) return
      const commands = [line(clipped.a, clipped.b, primitive.style, dpr)]
      if (primitive.text)
        commands.push(...lineText(primitive.a, primitive.b, primitive.text, primitive.style))
      const style = primitive.style?.strokeStyle
      const length = Math.max(8, (primitive.style?.strokeWidth ?? 1) * 3)
      const { angle } = arrowHead(clipped.a, clipped.b, length)
      if (style === 'arrow_left' || style === 'arrow_both')
        commands.push(wing(clipped.a, angle + Math.PI, length, primitive.style))
      if (style === 'arrow_right' || style === 'arrow_both')
        commands.push(wing(clipped.b, angle, length, primitive.style))
      if (primitive.showEndpoints !== false)
        for (const point of [primitive.a, primitive.b]) {
          if (pointInRect(point, clip)) commands.push(...anchor(point, primitive.style, dpr))
        }
      submit(ctx, commands, dpr)
    },
    area(ctx, primitive, dpr) {
      if (primitive.points.length === 0) return
      const commands: PaintPrimitive[] = [
        {
          kind: 'fill',
          paths: [primitive.points],
          color: primitive.style?.fill ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE,
          opacity: primitive.style?.fillOpacity ?? 1,
        },
      ]
      if (primitive.text) {
        const xs = primitive.points.map((point) => point.x),
          ys = primitive.points.map((point) => point.y)
        const layout = resolveAreaLabelLayout(
          Math.min(...xs),
          Math.max(...xs),
          primitive.text.position,
        )
        commands.push(
          ...text(
            primitive.text.text,
            layout.x,
            (Math.min(...ys) + Math.max(...ys)) / 2,
            primitive.style,
            primitive.text.align ?? layout.align,
            primitive.text.baseline ?? 'middle',
          ),
        )
      }
      submit(ctx, commands, dpr)
    },
    text(ctx, primitive, dpr) {
      submit(
        ctx,
        text(
          primitive.text,
          primitive.point.x,
          primitive.point.y,
          primitive.style,
          primitive.align ?? 'left',
          primitive.baseline ?? 'bottom',
        ),
        dpr,
      )
    },
    arrow(ctx, primitive, dpr) {
      const head = arrowHead(
        primitive.start,
        primitive.end,
        primitive.headLength ?? ARROW_HEAD_LENGTH,
        primitive.headAngle ?? ARROW_HEAD_ANGLE,
      )
      const commands: PaintPrimitive[] = [
        line(primitive.start, primitive.end, primitive.style, dpr),
        {
          kind: 'fill',
          paths: [[primitive.end, head.left, head.right]],
          color: primitive.style?.fill ?? primitive.style?.stroke ?? DEFAULT_DRAWING_STROKE,
        },
      ]
      if (primitive.text)
        commands.push(...lineText(primitive.start, primitive.end, primitive.text, primitive.style))
      submit(ctx, commands, dpr)
    },
  }
}
