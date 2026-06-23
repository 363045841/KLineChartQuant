import type {
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
} from '../../plugin'
import type { KLineData } from '../../types/price'

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
}

export class DrawingStore {
  private drawings: DrawingObject[] = []
  private selectedId: string | null = null

  getSelectedId(): string | null {
    return this.selectedId
  }

  setSelectedId(id: string | null): void {
    this.selectedId = id
  }

  getAll(): DrawingObject[] {
    return this.drawings
  }

  getVisibleByPane(paneId: string): DrawingObject[] {
    return this.drawings
      .filter((drawing) => drawing.visible && drawing.paneId === paneId)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }

  setAll(drawings: DrawingObject[]): void {
    this.drawings = [...drawings]
    if (this.selectedId && !this.drawings.some((d) => d.id === this.selectedId)) {
      this.selectedId = null
    }
  }

  upsert(drawing: DrawingObject): void {
    const index = this.drawings.findIndex((item) => item.id === drawing.id)
    if (index >= 0) {
      this.drawings[index] = drawing
      return
    }
    this.drawings.push(drawing)
  }

  remove(id: string): void {
    this.drawings = this.drawings.filter((drawing) => drawing.id !== id)
  }

  clear(): void {
    this.drawings = []
    this.selectedId = null
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

  compute(drawing: DrawingObject, context: DrawingComputeContext): DrawingGeometry | null {
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
    dpr: number
  ) => void
  area: (ctx: CanvasRenderingContext2D, primitive: AreaPrimitive, dpr: number) => void
  text: (ctx: CanvasRenderingContext2D, primitive: TextPrimitive, dpr: number) => void
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
  rect: { left: number; top: number; right: number; bottom: number }
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
  viewportClip: { left: number; top: number; right: number; bottom: number }
): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const { a, b, extend = 'none' } = primitive
  if (extend === 'none') {
    return clipLineToRect(a.x, a.y, b.x, b.y, viewportClip)
  }

  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null

  const distance = Math.max(viewportClip.right - viewportClip.left, viewportClip.bottom - viewportClip.top) * 4
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

function getAnchorDataIndex(anchor: DrawingObject['anchors'][number], data: KLineData[]): number {
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

export function createDefaultPrimitiveRendererSet(): PrimitiveRendererSet {
  return {
    point(ctx, primitive, dpr) {
      const radius = primitive.style?.pointRadius ?? 4
      ctx.save()
      ctx.fillStyle = primitive.style?.fill ?? primitive.style?.stroke ?? '#2962ff'
      ctx.beginPath()
      ctx.arc(primitive.point.x, primitive.point.y, Math.max(radius, 1 / dpr), 0, Math.PI * 2)
      ctx.fill()
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

      // 绘制端点（使用原始锚点位置，不是裁剪后的位置）
      if (primitive.showEndpoints !== false) {
        const pointRadius = primitive.style?.pointRadius ?? 4
        ctx.fillStyle = primitive.style?.stroke ?? '#2962ff'

        ctx.beginPath()
        ctx.arc(primitive.a.x, primitive.a.y, Math.max(pointRadius, 1 / dpr), 0, Math.PI * 2)
        ctx.fill()

        ctx.beginPath()
        ctx.arc(primitive.b.x, primitive.b.y, Math.max(pointRadius, 1 / dpr), 0, Math.PI * 2)
        ctx.fill()
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
  }
}

export function createTwoPointLineDefinition(kind: DrawingKind, extend: LinePrimitive['extend']): DrawingDefinition {
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

export function createSingleAnchorLineDefinition(kind: DrawingKind): DrawingDefinition {
  return {
    kind,
    minAnchors: 1,
    maxAnchors: 1,
    compute(drawing, context) {
      const [anchor] = drawing.anchors
      if (!anchor) return { primitives: [] }
      const point = context.toScreen(anchor)
      const bottom = context.pane.height
      const right = context.viewport.plotWidth

      if (kind === 'horizontal-line') {
        return {
          primitives: [
            { kind: 'line', a: { x: 0, y: point.y }, b: { x: right, y: point.y }, showEndpoints: false, style: drawing.style },
            { kind: 'point', point, style: drawing.style },
          ],
        }
      }

      if (kind === 'horizontal-ray') {
        return {
          primitives: [
            { kind: 'line', a: point, b: { x: right, y: point.y }, showEndpoints: false, style: drawing.style },
            { kind: 'point', point, style: drawing.style },
          ],
        }
      }

      if (kind === 'vertical-line') {
        return {
          primitives: [
            { kind: 'line', a: { x: point.x, y: 0 }, b: { x: point.x, y: bottom }, showEndpoints: false, style: drawing.style },
            { kind: 'point', point, style: drawing.style },
          ],
        }
      }

      // cross-line: 十字线，显示水平和垂直线，锚点显示一个点，边缘不显示端点
      return {
        primitives: [
          { kind: 'line', a: { x: 0, y: point.y }, b: { x: right, y: point.y }, showEndpoints: false, style: drawing.style },
          { kind: 'line', a: { x: point.x, y: 0 }, b: { x: point.x, y: bottom }, showEndpoints: false, style: drawing.style },
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
          { kind: 'line', a, b, style: drawing.style },
          {
            kind: 'text',
            point: { x: (a.x + b.x) / 2 + 8, y: Math.min(a.y, b.y) - 8 },
            text,
            align: 'left',
            baseline: 'bottom',
            style: drawing.style,
          },
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
      const extend = (drawing.params as { extend?: LinePrimitive['extend'] } | undefined)?.extend ?? 'none'

      // 计算 p4 对应的锚点信息（用于轴标签注册）
      const p4Index = third.index + (second.index - first.index)
      const p4Time = third.time
        ? (typeof third.time === 'string' ? new Date(third.time).getTime() : third.time) +
          ((typeof second.time === 'string' ? new Date(second.time).getTime() : second.time ?? 0) -
           (typeof first.time === 'string' ? new Date(first.time).getTime() : first.time ?? 0))
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
          { id: `${drawing.id}-p4`, index: p4Index, time: p4Time, price: third.price + (second.price - first.price) },
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
          ((typeof second.time === 'string' ? new Date(second.time).getTime() : second.time ?? 0) -
           (typeof first.time === 'string' ? new Date(first.time).getTime() : first.time ?? 0))
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
        computedAnchors: [
          { id: `${drawing.id}-p4`, index: p4Index, time: p4Time, price: p4Price },
        ],
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

      const clampedFirstIndex = Math.min(Math.max(Math.round(first.index), 0), context.seriesData.length - 1)
      const clampedSecondIndex = Math.min(Math.max(Math.round(second.index), 0), context.seriesData.length - 1)
      const startIndex = Math.min(clampedFirstIndex, clampedSecondIndex)
      const endIndex = Math.max(clampedFirstIndex, clampedSecondIndex)
      const slice = context.seriesData.slice(startIndex, endIndex + 1)
      const regression = computeLinearRegression(slice.map((item) => item.close))
      if (!regression) return { primitives: [] }

      const sigma = (drawing.params as { sigma?: number } | undefined)?.sigma ?? 2
      const offset = regression.stdDev * sigma
      const firstValue = regression.intercept
      const lastValue = regression.intercept + regression.slope * (slice.length - 1)

      const startAnchor = { id: `${drawing.id}-reg-start`, index: Math.round(first.index), time: context.seriesData[startIndex]!.timestamp, price: firstValue }
      const endAnchor = { id: `${drawing.id}-reg-end`, index: Math.round(second.index), time: context.seriesData[endIndex]!.timestamp, price: lastValue }
      const upperStartAnchor = { ...startAnchor, id: `${drawing.id}-reg-upper-start`, price: firstValue + offset }
      const upperEndAnchor = { ...endAnchor, id: `${drawing.id}-reg-upper-end`, price: lastValue + offset }
      const lowerStartAnchor = { ...startAnchor, id: `${drawing.id}-reg-lower-start`, price: firstValue - offset }
      const lowerEndAnchor = { ...endAnchor, id: `${drawing.id}-reg-lower-end`, price: lastValue - offset }

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
          { kind: 'line', a: middleA, b: middleB, style: { ...drawing.style, strokeStyle: 'dashed' } },
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
export type { DrawingToolId, DrawingAnchorInput, DrawingInteractionCallbacks } from './interaction'
