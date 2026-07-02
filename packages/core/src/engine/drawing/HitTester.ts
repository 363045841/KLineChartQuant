import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject } from '../../plugin'

import { anchorToScreen, pointToSegmentDist } from './coordinateUtils'
import { computeLinearRegression } from './linearRegression'
import { getExtendMode } from './toolConfig'

// ---- Types ----

/** 命中检测结果：anchorIndex 存在表示点到锚点，否则点到线段 */
export type HitResult = { drawing: DrawingObject; anchorIndex: number } | { drawing: DrawingObject }

/** 二维线段，两端点为屏幕坐标（px） */
export interface LineSegment {
  a: { x: number; y: number }
  b: { x: number; y: number }
}

/**
 * 回归通道几何信息（屏幕坐标）。
 * segments 为三条平行线（中/上/下），endpoints 标出可拖拽的端点。
 */
export interface RegressionChannelGeometry {
  segments: LineSegment[]
  endpoints: Array<{ point: { x: number; y: number }; anchorIndex: 0 | 1 }>
}

/** 锚点点击命中半径（px） */
const ANCHOR_HIT_RADIUS = 8
/** 线段点击命中半径（px） */
const LINE_HIT_RADIUS = 6

/**
 * Hit detection — test mouse position against drawing anchors and line segments.
 * Pure computation, no side effects.
 */
export class HitTester {
  /**
   * Find the drawing (and optionally which anchor) under the given mouse position.
   * Anchors are checked first, then line segments.
   */
  hitTest(
    mouseX: number,
    mouseY: number,
    drawings: DrawingObject[],
    adapter: DrawingChartAdapter,
  ): HitResult | null {
    const visibleDrawings = drawings.filter((d) => d.visible)
    const regressionGeometryCache = new Map<string, RegressionChannelGeometry | null>()

    // Check anchor hits first
    for (const drawing of visibleDrawings) {
      // regression-channel: computed endpoints are also draggable
      if (drawing.kind === 'regression-channel' && drawing.anchors.length >= 2) {
        const hit = this.hitTestRegressionEndpoints(
          drawing,
          mouseX,
          mouseY,
          adapter,
          regressionGeometryCache,
        )
        if (hit) return hit
      }

      for (let i = 0; i < drawing.anchors.length; i++) {
        const screen = anchorToScreen(drawing.anchors[i]!, adapter)
        if (!screen) continue
        const dist = Math.hypot(mouseX - screen.x, mouseY - screen.y)
        if (dist <= ANCHOR_HIT_RADIUS) {
          return { drawing, anchorIndex: i }
        }
      }
    }

    // Check line segment hits
    for (const drawing of visibleDrawings) {
      const segments = this.getDrawingLineSegments(drawing, adapter, regressionGeometryCache)
      for (const seg of segments) {
        const dist = pointToSegmentDist(mouseX, mouseY, seg.a, seg.b)
        if (dist <= LINE_HIT_RADIUS) {
          return { drawing }
        }
      }
    }

    return null
  }

  /**
   * Get the screen-space line segments for a drawing, used for hit-testing.
   */
  getDrawingLineSegments(
    drawing: DrawingObject,
    adapter: DrawingChartAdapter,
    regressionGeometryCache?: Map<string, RegressionChannelGeometry | null>,
  ): LineSegment[] {
    const viewport = adapter.getViewport()
    if (!viewport) return []

    // regression-channel: compute from linear regression geometry
    if (drawing.kind === 'regression-channel') {
      return (
        this.getRegressionChannelGeometry(drawing, adapter, regressionGeometryCache)?.segments ?? []
      )
    }

    // Single-anchor drawings (horizontal-line, horizontal-ray, vertical-line, cross-line)
    if (drawing.anchors.length === 1) {
      const screen = anchorToScreen(drawing.anchors[0]!, adapter)
      if (!screen) return []

      const paneInfo = adapter.getPaneInfo('main')
      if (!paneInfo) return []

      const right = viewport.plotWidth
      const bottom = paneInfo.height

      switch (drawing.kind) {
        case 'horizontal-line':
          return [{ a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } }]
        case 'horizontal-ray':
          return [{ a: screen, b: { x: right, y: screen.y } }]
        case 'vertical-line':
          return [{ a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } }]
        case 'cross-line':
          return [
            { a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } },
            { a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } },
          ]
        default:
          return []
      }
    }

    // Multi-anchor drawings (2+)
    const points = drawing.anchors.map((a) => anchorToScreen(a, adapter)).filter(Boolean) as {
      x: number
      y: number
    }[]
    if (points.length < 2) return []

    const segments: LineSegment[] = []

    if (points.length === 2) {
      const a = points[0]!
      const b = points[1]!
      const dx = b.x - a.x
      const dy = b.y - a.y

      let start = a
      let end = b

      const extend = getExtendMode(drawing.kind)
      const maxLen = Math.max(viewport.plotWidth, viewport.plotHeight) * 4

      if (extend === 'right' || extend === 'both') {
        end = { x: b.x + dx * maxLen, y: b.y + dy * maxLen }
      }
      if (extend === 'left' || extend === 'both') {
        start = { x: a.x - dx * maxLen, y: a.y - dy * maxLen }
      }

      segments.push({ a: start, b: end })
    } else if (points.length >= 3) {
      switch (drawing.kind) {
        case 'parallel-channel': {
          const [p1, p2, p3] = points as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ]
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const p4 = { x: p3.x + dx, y: p3.y + dy }
          segments.push({ a: p1, b: p2 }, { a: p3, b: p4 })
          break
        }
        case 'flat-line': {
          const [p1, p2, p3] = points as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ]
          const h1 = { x: p1.x, y: p3.y }
          const h2 = { x: p2.x, y: p3.y }
          segments.push({ a: p1, b: p2 }, { a: h1, b: h2 })
          break
        }
        case 'disjoint-channel': {
          const [p1, p2, p3] = points as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ]
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const p4 = { x: p3.x + dx, y: p3.y - dy }
          segments.push({ a: p1, b: p2 }, { a: p3, b: p4 })
          break
        }
        default:
          for (let i = 0; i < points.length - 1; i++) {
            segments.push({ a: points[i]!, b: points[i + 1]! })
          }
      }
    }

    return segments
  }

  /**
   * Compute the screen-space geometry of a regression channel.
   */
  getRegressionChannelGeometry(
    drawing: DrawingObject,
    adapter: DrawingChartAdapter,
    cache?: Map<string, RegressionChannelGeometry | null>,
  ): RegressionChannelGeometry | null {
    const cached = cache?.get(drawing.id)
    if (cached !== undefined) return cached

    const data = adapter.getData()
    if (data.length === 0 || drawing.anchors.length < 2) {
      cache?.set(drawing.id, null)
      return null
    }

    const firstIndex = Math.round(drawing.anchors[0]!.index)
    const secondIndex = Math.round(drawing.anchors[1]!.index)
    const clampedFirst = Math.min(Math.max(firstIndex, 0), data.length - 1)
    const clampedSecond = Math.min(Math.max(secondIndex, 0), data.length - 1)
    const startIndex = Math.min(clampedFirst, clampedSecond)
    const endIndex = Math.max(clampedFirst, clampedSecond)
    const slice = data.slice(startIndex, endIndex + 1)
    const regression = computeLinearRegression(slice.map((item: { close: number }) => item.close))
    if (!regression) {
      cache?.set(drawing.id, null)
      return null
    }

    const sigma = (drawing.params as { sigma?: number } | undefined)?.sigma ?? 2
    const offset = regression.stdDev * sigma
    const firstValue = regression.intercept
    const lastValue = regression.intercept + regression.slope * (slice.length - 1)

    const middleStart = anchorToScreen({ id: '', index: firstIndex, price: firstValue }, adapter)
    const middleEnd = anchorToScreen({ id: '', index: secondIndex, price: lastValue }, adapter)
    const upperStart = anchorToScreen(
      { id: '', index: firstIndex, price: firstValue + offset },
      adapter,
    )
    const upperEnd = anchorToScreen(
      { id: '', index: secondIndex, price: lastValue + offset },
      adapter,
    )
    const lowerStart = anchorToScreen(
      { id: '', index: firstIndex, price: firstValue - offset },
      adapter,
    )
    const lowerEnd = anchorToScreen(
      { id: '', index: secondIndex, price: lastValue - offset },
      adapter,
    )

    const segments: LineSegment[] = []
    if (middleStart && middleEnd) segments.push({ a: middleStart, b: middleEnd })
    if (upperStart && upperEnd) segments.push({ a: upperStart, b: upperEnd })
    if (lowerStart && lowerEnd) segments.push({ a: lowerStart, b: lowerEnd })

    const endpoints: RegressionChannelGeometry['endpoints'] = []
    if (middleStart) endpoints.push({ point: middleStart, anchorIndex: 0 })
    if (middleEnd) endpoints.push({ point: middleEnd, anchorIndex: 1 })
    if (upperStart) endpoints.push({ point: upperStart, anchorIndex: 0 })
    if (upperEnd) endpoints.push({ point: upperEnd, anchorIndex: 1 })
    if (lowerStart) endpoints.push({ point: lowerStart, anchorIndex: 0 })
    if (lowerEnd) endpoints.push({ point: lowerEnd, anchorIndex: 1 })

    const geometry: RegressionChannelGeometry = { segments, endpoints }
    cache?.set(drawing.id, geometry)
    return geometry
  }

  /**
   * regression-channel only: check hit against computed regression endpoints
   * (which may be far from stored anchor positions).
   */
  private hitTestRegressionEndpoints(
    drawing: DrawingObject,
    mouseX: number,
    mouseY: number,
    adapter: DrawingChartAdapter,
    cache?: Map<string, RegressionChannelGeometry | null>,
  ): { drawing: DrawingObject; anchorIndex: number } | null {
    const geometry = this.getRegressionChannelGeometry(drawing, adapter, cache)
    if (!geometry) return null

    for (const endpoint of geometry.endpoints) {
      const dist = Math.hypot(mouseX - endpoint.point.x, mouseY - endpoint.point.y)
      if (dist <= ANCHOR_HIT_RADIUS) {
        return { drawing, anchorIndex: endpoint.anchorIndex }
      }
    }

    return null
  }
}
