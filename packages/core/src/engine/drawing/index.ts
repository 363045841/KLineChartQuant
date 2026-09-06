import type {
  DrawingObject,
  DrawingWorkspaceId,
  DrawingKind,
  DrawingDefinition,
  DrawingComputeContext,
  DrawingGeometry,
  DrawingStyle,
  PointPrimitive,
  LinePrimitive,
  AreaPrimitive,
  TextPrimitive,
  ArrowPrimitive,
} from '../../foundation/plugin/index'
import type { KLineData } from '../../foundation/types/price'
import { ChartWorkspaceId } from '../../foundation/types/chartView'

export type {
  DrawingObject,
  DrawingKind,
  DrawingDefinition,
  DrawingComputeContext,
  DrawingGeometry,
  DrawingStyle,
  PointPrimitive,
  LinePrimitive,
  AreaPrimitive,
  TextPrimitive,
  ArrowPrimitive,
}

import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import { mergePaint } from './DrawingState'

export { DrawingDocument } from './DrawingDocument'
export { DrawingCommands } from './DrawingCommands'
export type {
  CreateDrawingInput,
  DrawingAnchorCommandInput,
  DrawingDocumentDependencies,
  UpdateDrawingPatch,
} from './DrawingDocument'
export type { DrawingCommandsDependencies } from './DrawingCommands'

export interface DrawingStoreDeps {
  drawings$: ReadonlySignal<ReadonlyArray<DrawingObject>>
  selectedDrawingIds$: ReadonlySignal<ReadonlyArray<string>>
  /** 会话层覆盖（拖拽/预览）；缺省为空 */
  getOverlay?: () => ReadonlyArray<DrawingObject>
}

/**
 * 绘图投影器 —— kernel 业务 SSOT ⊕ 会话 overlay，供渲染插件读取。
 */
export class DrawingStore {
  constructor(private readonly deps: DrawingStoreDeps) {}

  getSelectedIds(): ReadonlyArray<string> {
    return this.deps.selectedDrawingIds$.peek()
  }

  private paintList(): DrawingObject[] {
    const committed = this.deps.drawings$.peek()
    const overlay = this.deps.getOverlay?.() ?? []
    return mergePaint(committed, overlay)
  }

  getAll(): DrawingObject[] {
    return this.paintList()
  }

  getVisibleByPane(paneId: string, workspaceId: DrawingWorkspaceId): DrawingObject[] {
    return this.paintList()
      .filter(
        (drawing) =>
          drawing.visible &&
          drawing.paneId === paneId &&
          (drawing.workspaceId ?? ChartWorkspaceId.KLine) === workspaceId,
      )
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }
}

export class DrawingDefinitionRegistry {
  private definitions = new Map<DrawingKind, DrawingDefinition>()

  register<TParams = Record<string, unknown>>(definition: DrawingDefinition<TParams>): void {
    this.definitions.set(definition.kind, definition as DrawingDefinition)
  }

  get(kind: DrawingKind): DrawingDefinition | undefined {
    return this.definitions.get(kind)
  }

  compute(
    drawing: import('../../foundation/plugin').ResolvedDrawingObject,
    context: DrawingComputeContext,
  ): DrawingGeometry | null {
    const definition = this.get(drawing.kind)
    if (!definition) return null
    return definition.compute(drawing, context)
  }
}

export type PrimitiveRendererSet = {
  point: (ctx: CanvasRenderingContext2D, primitive: PointPrimitive, dpr: number) => void
  line: (
    ctx: CanvasRenderingContext2D,
    primitive: LinePrimitive,
    viewportClip: { left: number; top: number; right: number; bottom: number },
    dpr: number,
  ) => void
  area: (ctx: CanvasRenderingContext2D, primitive: AreaPrimitive, dpr: number) => void
  text: (ctx: CanvasRenderingContext2D, primitive: TextPrimitive, dpr: number) => void
  arrow: (ctx: CanvasRenderingContext2D, primitive: ArrowPrimitive, dpr: number) => void
}

function applyLineStyle(ctx: CanvasRenderingContext2D, style?: DrawingStyle): void {
  ctx.strokeStyle = style?.stroke ?? '#2962ff'
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

function applyFillStyle(ctx: CanvasRenderingContext2D, style?: DrawingStyle): void {
  ctx.fillStyle = style?.fill ?? style?.stroke ?? '#2962ff'
  ctx.globalAlpha = style?.fillOpacity ?? 1
}

function clipLineToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: { left: number; top: number; right: number; bottom: number },
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const INSIDE = 0
  const LEFT = 1
  const RIGHT = 2
  const BOTTOM = 4
  const TOP = 8

  const computeCode = (x: number, y: number) => {
    let code = INSIDE
    if (x < rect.left) code |= LEFT
    else if (x > rect.right) code |= RIGHT
    if (y < rect.top) code |= TOP
    else if (y > rect.bottom) code |= BOTTOM
    return code
  }

  let ax = x1
  let ay = y1
  let bx = x2
  let by = y2

  while (true) {
    const codeA = computeCode(ax, ay)
    const codeB = computeCode(bx, by)

    if (!(codeA | codeB)) {
      return { a: { x: ax, y: ay }, b: { x: bx, y: by } }
    }

    if (codeA & codeB) {
      return null
    }

    const codeOut = codeA || codeB
    let x = 0
    let y = 0

    if (codeOut & TOP) {
      x = ax + ((bx - ax) * (rect.top - ay)) / (by - ay)
      y = rect.top
    } else if (codeOut & BOTTOM) {
      x = ax + ((bx - ax) * (rect.bottom - ay)) / (by - ay)
      y = rect.bottom
    } else if (codeOut & RIGHT) {
      y = ay + ((by - ay) * (rect.right - ax)) / (bx - ax)
      x = rect.right
    } else {
      y = ay + ((by - ay) * (rect.left - ax)) / (bx - ax)
      x = rect.left
    }

    if (codeOut === codeA) {
      ax = x
      ay = y
    } else {
      bx = x
      by = y
    }
  }
}

function extendLineToViewport(
  primitive: LinePrimitive,
  viewportClip: { left: number; top: number; right: number; bottom: number },
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const { a, b, extend = 'none' } = primitive
  if (extend === 'none') {
    return clipLineToRect(a.x, a.y, b.x, b.y, viewportClip)
  }

  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null

  const distance =
    Math.max(viewportClip.right - viewportClip.left, viewportClip.bottom - viewportClip.top) * 4
  let start = a
  let end = b

  if (extend === 'left' || extend === 'both') {
    start = { x: a.x - dx * distance, y: a.y - dy * distance }
  }
  if (extend === 'right' || extend === 'both') {
    end = { x: b.x + dx * distance, y: b.y + dy * distance }
  }

  return clipLineToRect(start.x, start.y, end.x, end.y, viewportClip)
}

function getAnchorDataIndex(
  anchor: import('../../foundation/plugin').ResolvedDrawingAnchor,
  data: KLineData[],
): number {
  if (!Number.isFinite(anchor.index)) return -1
  const index = Math.round(anchor.index)
  if (index < 0 || index >= data.length) return -1
  return index
}

function formatSigned(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0'
  const fixed = value.toFixed(digits)
  return value > 0 ? `+${fixed}` : fixed
}

import { computeLinearRegression } from './linearRegression'
export { computeLinearRegression }

const LINE_TEXT_GAP_PX = 6

export function createDefaultPrimitiveRendererSet(): PrimitiveRendererSet {
  return {
    point(ctx, primitive, dpr) {
      const radius = primitive.style?.pointRadius ?? 4
      ctx.save()
      ctx.fillStyle = primitive.style?.fill ?? primitive.style?.stroke ?? '#2962ff'
      ctx.beginPath()
      ctx.arc(primitive.point.x, primitive.point.y, Math.max(radius, 1 / dpr), 0, Math.PI * 2)
      ctx.fill()
      if (primitive.text) {
        ctx.fillStyle = primitive.style?.textColor ?? primitive.style?.stroke ?? '#2962ff'
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? 'center'
        ctx.textBaseline = primitive.text.baseline ?? 'middle'
        ctx.fillText(primitive.text.text, primitive.point.x, primitive.point.y)
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
        // 标签固定在两枚原始锚点之间，不随延长线或视口裁剪漂移。
        const centerX = (primitive.a.x + primitive.b.x) / 2
        const centerY = (primitive.a.y + primitive.b.y) / 2
        let rotation = Math.atan2(primitive.b.y - primitive.a.y, primitive.b.x - primitive.a.x)
        // 文字与线平行，但始终保持正向可读。
        if (rotation > Math.PI / 2) rotation -= Math.PI
        if (rotation <= -Math.PI / 2) rotation += Math.PI
        // 文本沿线的上侧法线偏移，避免字形覆盖直线。
        const textX = centerX + Math.sin(rotation) * LINE_TEXT_GAP_PX
        const textY = centerY - Math.cos(rotation) * LINE_TEXT_GAP_PX
        ctx.save()
        ctx.fillStyle = primitive.style?.textColor ?? primitive.style?.stroke ?? '#2962ff'
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? 'center'
        ctx.textBaseline = primitive.text.baseline ?? 'middle'
        ctx.translate(textX, textY)
        ctx.rotate(rotation)
        ctx.fillText(primitive.text.text, 0, 0)
        ctx.restore()
      }

      // 绘制端点（使用原始锚点位置，不是裁剪后的位置）；屏幕外锚点只保留被裁剪的线段。
      if (primitive.showEndpoints !== false) {
        const pointRadius = primitive.style?.pointRadius ?? 4
        ctx.fillStyle = primitive.style?.stroke ?? '#2962ff'

        if (
          primitive.a.x >= viewportClip.left &&
          primitive.a.x <= viewportClip.right &&
          primitive.a.y >= viewportClip.top &&
          primitive.a.y <= viewportClip.bottom
        ) {
          ctx.beginPath()
          ctx.arc(primitive.a.x, primitive.a.y, Math.max(pointRadius, 1 / dpr), 0, Math.PI * 2)
          ctx.fill()
        }

        if (
          primitive.b.x >= viewportClip.left &&
          primitive.b.x <= viewportClip.right &&
          primitive.b.y >= viewportClip.top &&
          primitive.b.y <= viewportClip.bottom
        ) {
          ctx.beginPath()
          ctx.arc(primitive.b.x, primitive.b.y, Math.max(pointRadius, 1 / dpr), 0, Math.PI * 2)
          ctx.fill()
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
        ctx.fillStyle = primitive.style?.textColor ?? primitive.style?.stroke ?? '#2962ff'
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? 'center'
        ctx.textBaseline = primitive.text.baseline ?? 'middle'
        ctx.fillText(
          primitive.text.text,
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        )
      }
      ctx.restore()
    },

    text(ctx, primitive) {
      ctx.save()
      ctx.fillStyle = primitive.style?.textColor ?? primitive.style?.stroke ?? '#2962ff'
      ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
      ctx.textAlign = primitive.align ?? 'left'
      ctx.textBaseline = primitive.baseline ?? 'bottom'
      ctx.fillText(primitive.text, primitive.point.x, primitive.point.y)
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

      ctx.fillStyle = primitive.style?.fill ?? primitive.style?.stroke ?? '#2962ff'
      ctx.beginPath()
      ctx.moveTo(primitive.end.x, primitive.end.y)
      ctx.lineTo(left.x, left.y)
      ctx.lineTo(right.x, right.y)
      ctx.closePath()
      ctx.fill()
      if (primitive.text) {
        const centerX = (primitive.start.x + primitive.end.x) / 2
        const centerY = (primitive.start.y + primitive.end.y) / 2
        let rotation = angle
        if (rotation > Math.PI / 2) rotation -= Math.PI
        if (rotation <= -Math.PI / 2) rotation += Math.PI
        const textX = centerX + Math.sin(rotation) * LINE_TEXT_GAP_PX
        const textY = centerY - Math.cos(rotation) * LINE_TEXT_GAP_PX
        ctx.fillStyle = primitive.style?.textColor ?? primitive.style?.stroke ?? '#2962ff'
        ctx.font = `${primitive.style?.fontSize ?? 12}px sans-serif`
        ctx.textAlign = primitive.text.align ?? 'center'
        ctx.textBaseline = primitive.text.baseline ?? 'middle'
        ctx.save()
        ctx.translate(textX, textY)
        ctx.rotate(rotation)
        ctx.fillText(primitive.text.text, 0, 0)
        ctx.restore()
      }
      ctx.restore()
    },
  }
}

export function createTwoPointLineDefinition(
  kind: DrawingKind,
  extend: LinePrimitive['extend'],
): DrawingDefinition {
  return {
    kind,
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      return {
        primitives: [
          {
            kind: 'line',
            a: context.toScreen(first),
            b: context.toScreen(second),
            extend,
            style: drawing.style,
          },
        ],
      }
    },
  }
}

/** 创建斐波那契回撤图形：两个锚点定义区间，水平线覆盖区间的时间范围。 */
export function createFibRetracementDefinition(): DrawingDefinition {
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  return {
    kind: 'fib-retracement',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const left = Math.min(a.x, b.x)
      const right = Math.max(a.x, b.x)
      const configured = (drawing.params as { levels?: number[] } | undefined)?.levels
      const ratios = configured?.length ? configured : levels
      return {
        primitives: ratios.flatMap((ratio) => {
          const y = a.y + (b.y - a.y) * ratio
          return [
            { kind: 'line' as const, a: { x: left, y }, b: { x: right, y }, style: drawing.style },
            {
              kind: 'text' as const,
              point: { x: right + 4, y },
              text: `${(ratio * 100).toFixed(1)}%`,
              baseline: 'middle' as const,
              style: drawing.style,
            },
          ]
        }),
      }
    },
  }
}

/** 创建矩形图形：两个锚点分别代表矩形的对角点。 */
export function createRectangleDefinition(): DrawingDefinition {
  return {
    kind: 'rectangle',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const left = Math.min(a.x, b.x)
      const right = Math.max(a.x, b.x)
      const top = Math.min(a.y, b.y)
      const bottom = Math.max(a.y, b.y)
      const topLeft = { x: left, y: top }
      const topRight = { x: right, y: top }
      const bottomRight = { x: right, y: bottom }
      const bottomLeft = { x: left, y: bottom }
      return {
        primitives: [
          {
            kind: 'area',
            points: [topLeft, topRight, bottomRight, bottomLeft],
            closed: true,
            style: { ...drawing.style, fillOpacity: drawing.style.fillOpacity ?? 0.1 },
          },
          { kind: 'line', a: topLeft, b: topRight, style: drawing.style },
          { kind: 'line', a: topRight, b: bottomRight, style: drawing.style },
          { kind: 'line', a: bottomRight, b: bottomLeft, style: drawing.style },
          { kind: 'line', a: bottomLeft, b: topLeft, style: drawing.style },
        ],
      }
    },
  }
}

/** 创建箭头图形：第二个锚点是箭头尖端。 */
export function createArrowDefinition(): DrawingDefinition {
  return {
    kind: 'arrow',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      return {
        primitives: [{ kind: 'arrow', start: a, end: b, style: drawing.style }],
      }
    },
  }
}

export function createSingleAnchorLineDefinition(kind: DrawingKind): DrawingDefinition {
  return {
    kind,
    minAnchors: 1,
    maxAnchors: 1,
    compute(drawing, context) {
      const [anchor] = drawing.anchors
      if (!anchor) return { primitives: [] }
      const bottom = context.pane.height
      const right = context.viewport.plotWidth

      if (kind === 'horizontal-line') {
        if (anchor.type === 'vertical') return { primitives: [] }
        const y = context.pane.yAxis.priceToY(anchor.price)
        return {
          primitives: [
            {
              kind: 'line',
              a: { x: 0, y },
              b: { x: right, y },
              showEndpoints: false,
              style: drawing.style,
            },
          ],
        }
      }

      const point = context.toScreen(anchor)

      if (kind === 'horizontal-ray') {
        return {
          primitives: [
            {
              kind: 'line',
              a: point,
              b: { x: right, y: point.y },
              showEndpoints: false,
              style: drawing.style,
            },
            { kind: 'point', point, style: drawing.style },
          ],
        }
      }

      if (kind === 'vertical-line') {
        if (anchor.type === 'horizontal') return { primitives: [] }
        return {
          primitives: [
            {
              kind: 'line',
              a: { x: point.x, y: 0 },
              b: { x: point.x, y: bottom },
              showEndpoints: false,
              style: drawing.style,
            },
          ],
        }
      }

      // cross-line: 十字线，显示水平和垂直线，锚点显示一个点，边缘不显示端点
      return {
        primitives: [
          {
            kind: 'line',
            a: { x: 0, y: point.y },
            b: { x: right, y: point.y },
            showEndpoints: false,
            style: drawing.style,
          },
          {
            kind: 'line',
            a: { x: point.x, y: 0 },
            b: { x: point.x, y: bottom },
            showEndpoints: false,
            style: drawing.style,
          },
          { kind: 'point', point, style: drawing.style },
        ],
      }
    },
  }
}

export function createInfoLineDefinition(): DrawingDefinition {
  return {
    kind: 'info-line',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const a = context.toScreen(first)
      const b = context.toScreen(second)
      const firstIndex = Math.round(first.index)
      const secondIndex = Math.round(second.index)
      const bars = secondIndex - firstIndex
      const delta = second.price - first.price
      const percent = first.price !== 0 ? (delta / first.price) * 100 : 0
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
      const text = `${formatSigned(delta)} (${formatSigned(percent)}%)  ${bars} bars  ${formatSigned(angle)}°`

      return {
        primitives: [
          { kind: 'line', a, b, text: { text, baseline: 'bottom' }, style: drawing.style },
        ],
        meta: { delta, percent, bars, angle },
      }
    },
  }
}

export function createParallelChannelDefinition(): DrawingDefinition {
  return {
    kind: 'parallel-channel',
    minAnchors: 3,
    maxAnchors: 3,
    compute(drawing, context) {
      const [first, second, third] = drawing.anchors
      if (!first || !second || !third) return { primitives: [] }
      const p1 = context.toScreen(first)
      const p2 = context.toScreen(second)
      const p3 = context.toScreen(third)
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const p4 = { x: p3.x + dx, y: p3.y + dy }
      const extend =
        (drawing.params as { extend?: LinePrimitive['extend'] } | undefined)?.extend ?? 'none'

      // 计算 p4 对应的锚点信息（用于轴标签注册）
      const p4Index = third.index + (second.index - first.index)
      const p4Time = third.time
        ? (typeof third.time === 'string' ? new Date(third.time).getTime() : third.time) +
          ((typeof second.time === 'string'
            ? new Date(second.time).getTime()
            : (second.time ?? 0)) -
            (typeof first.time === 'string' ? new Date(first.time).getTime() : (first.time ?? 0)))
        : undefined

      return {
        primitives: [
          {
            kind: 'area',
            points: [p1, p2, p4, p3],
            closed: true,
            style: drawing.style,
          },
          { kind: 'line', a: p1, b: p2, extend, style: drawing.style },
          { kind: 'line', a: p3, b: p4, extend, style: drawing.style },
        ],
        computedAnchors: [
          {
            id: `${drawing.id}-p4`,
            index: p4Index,
            time: p4Time,
            price: third.price + (second.price - first.price),
          },
        ],
      }
    },
  }
}

export function createFlatLineDefinition(): DrawingDefinition {
  return {
    kind: 'flat-line',
    minAnchors: 3,
    maxAnchors: 3,
    compute(drawing, context) {
      const [first, second, third] = drawing.anchors
      if (!first || !second || !third) return { primitives: [] }

      const p1 = context.toScreen(first)
      const p2 = context.toScreen(second)
      const thirdScreen = context.toScreen(third)
      const h1 = { x: p1.x, y: thirdScreen.y }
      const h2 = { x: p2.x, y: thirdScreen.y }

      return {
        primitives: [
          {
            kind: 'area',
            points: [p1, p2, h2, h1],
            closed: true,
            style: drawing.style,
          },
          { kind: 'line', a: p1, b: p2, style: drawing.style },
          { kind: 'line', a: h1, b: h2, style: drawing.style },
          { kind: 'point', point: h1, style: drawing.style },
          { kind: 'point', point: h2, style: drawing.style },
        ],
        computedAnchors: [
          { id: `${drawing.id}-h1`, index: first.index, time: first.time, price: third.price },
          { id: `${drawing.id}-h2`, index: second.index, time: second.time, price: third.price },
        ],
      }
    },
  }
}

export function createDisjointChannelDefinition(): DrawingDefinition {
  return {
    kind: 'disjoint-channel',
    minAnchors: 3,
    maxAnchors: 3,
    compute(drawing, context) {
      const [first, second, third] = drawing.anchors
      if (!first || !second || !third) return { primitives: [] }

      const p1 = context.toScreen(first)
      const p2 = context.toScreen(second)
      const p3 = context.toScreen(third)

      // 第二条线：过 p3，斜率取反
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const p4 = { x: p3.x + dx, y: p3.y - dy }

      // 计算 p4 对应的锚点信息（用于轴标签注册）
      const p4Index = third.index + (second.index - first.index)
      const p4Price = third.price - (second.price - first.price)
      const p4Time = third.time
        ? (typeof third.time === 'string' ? new Date(third.time).getTime() : third.time) -
          ((typeof second.time === 'string'
            ? new Date(second.time).getTime()
            : (second.time ?? 0)) -
            (typeof first.time === 'string' ? new Date(first.time).getTime() : (first.time ?? 0)))
        : undefined

      return {
        primitives: [
          // 填充区域
          {
            kind: 'area',
            points: [p1, p2, p4, p3],
            closed: true,
            style: drawing.style,
          },
          // 斜率 k 的线
          { kind: 'line', a: p1, b: p2, style: drawing.style },
          // 斜率 -k 的线
          { kind: 'line', a: p3, b: p4, style: drawing.style },
        ],
        computedAnchors: [{ id: `${drawing.id}-p4`, index: p4Index, time: p4Time, price: p4Price }],
      }
    },
  }
}

export function createRegressionChannelDefinition(): DrawingDefinition {
  return {
    kind: 'regression-channel',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const firstIndex = getAnchorDataIndex(first, context.seriesData)
      const secondIndex = getAnchorDataIndex(second, context.seriesData)
      if (firstIndex < 0 && secondIndex < 0) return { primitives: [] }

      const clampedFirstIndex = Math.min(
        Math.max(Math.round(first.index), 0),
        context.seriesData.length - 1,
      )
      const clampedSecondIndex = Math.min(
        Math.max(Math.round(second.index), 0),
        context.seriesData.length - 1,
      )
      const startIndex = Math.min(clampedFirstIndex, clampedSecondIndex)
      const endIndex = Math.max(clampedFirstIndex, clampedSecondIndex)
      const slice = context.seriesData.slice(startIndex, endIndex + 1)
      const regression = computeLinearRegression(slice.map((item) => item.close))
      if (!regression) return { primitives: [] }

      const sigma = (drawing.params as { sigma?: number } | undefined)?.sigma ?? 2
      const offset = regression.stdDev * sigma
      const firstValue = regression.intercept
      const lastValue = regression.intercept + regression.slope * (slice.length - 1)

      const startAnchor = {
        id: `${drawing.id}-reg-start`,
        index: Math.round(first.index),
        time: context.seriesData[startIndex]!.timestamp,
        price: firstValue,
      }
      const endAnchor = {
        id: `${drawing.id}-reg-end`,
        index: Math.round(second.index),
        time: context.seriesData[endIndex]!.timestamp,
        price: lastValue,
      }
      const upperStartAnchor = {
        ...startAnchor,
        id: `${drawing.id}-reg-upper-start`,
        price: firstValue + offset,
      }
      const upperEndAnchor = {
        ...endAnchor,
        id: `${drawing.id}-reg-upper-end`,
        price: lastValue + offset,
      }
      const lowerStartAnchor = {
        ...startAnchor,
        id: `${drawing.id}-reg-lower-start`,
        price: firstValue - offset,
      }
      const lowerEndAnchor = {
        ...endAnchor,
        id: `${drawing.id}-reg-lower-end`,
        price: lastValue - offset,
      }

      const middleA = context.toScreen(startAnchor)
      const middleB = context.toScreen(endAnchor)
      const upperA = context.toScreen(upperStartAnchor)
      const upperB = context.toScreen(upperEndAnchor)
      const lowerA = context.toScreen(lowerStartAnchor)
      const lowerB = context.toScreen(lowerEndAnchor)

      return {
        primitives: [
          {
            kind: 'area',
            points: [upperA, upperB, lowerB, lowerA],
            closed: true,
            style: drawing.style,
          },
          // 中间回归线使用虚线
          {
            kind: 'line',
            a: middleA,
            b: middleB,
            style: { ...drawing.style, strokeStyle: 'dashed' },
          },
          { kind: 'line', a: upperA, b: upperB, style: drawing.style },
          { kind: 'line', a: lowerA, b: lowerB, style: drawing.style },
        ],
        computedAnchors: [startAnchor, endAnchor],
        meta: { sigma, stdDev: regression.stdDev, slope: regression.slope },
      }
    },
  }
}

export function registerDefaultDrawingDefinitions(registry: DrawingDefinitionRegistry): void {
  registry.register(createTwoPointLineDefinition('trend-line', 'none'))
  registry.register(createTwoPointLineDefinition('ray', 'right'))
  registry.register(createTwoPointLineDefinition('extended-line', 'both'))
  registry.register(createFibRetracementDefinition())
  registry.register(createRectangleDefinition())
  registry.register(createArrowDefinition())
  registry.register(createSingleAnchorLineDefinition('horizontal-line'))
  registry.register(createSingleAnchorLineDefinition('horizontal-ray'))
  registry.register(createSingleAnchorLineDefinition('vertical-line'))
  registry.register(createSingleAnchorLineDefinition('cross-line'))
  registry.register(createInfoLineDefinition())
  registry.register(createParallelChannelDefinition())
  registry.register(createRegressionChannelDefinition())
  registry.register(createFlatLineDefinition())
  registry.register(createDisjointChannelDefinition())
}

// 导出交互控制器
export { DrawingInteractionController } from './interaction'
export type {
  DrawingToolId,
  InteractionDrawingAnchor,
  DrawingInteractionCallbacks,
  DrawingLineLabelTarget,
} from './interaction'
