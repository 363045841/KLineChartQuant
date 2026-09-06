import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject } from '../../foundation/plugin/index'

import { anchorToScreen, isScreenPoint, pointToSegmentDistanceSq } from './coordinateUtils'
import { getDrawingLineLabel } from './lineLabels'
import { getDrawingAreaLabel } from './lineLabels'
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
const ANCHOR_HIT_RADIUS_SQ = ANCHOR_HIT_RADIUS * ANCHOR_HIT_RADIUS
/** 线段点击命中半径（px） */
const LINE_HIT_RADIUS = 6
const LINE_HIT_RADIUS_SQ = LINE_HIT_RADIUS * LINE_HIT_RADIUS
/** 线段中心文本热点半径（px）。 */
const LINE_LABEL_TARGET_RADIUS = 18
const LINE_LABEL_TARGET_RADIUS_SQ = LINE_LABEL_TARGET_RADIUS * LINE_LABEL_TARGET_RADIUS

/** 线段中心文本编辑热点。 */
export interface LineLabelTarget {
  readonly drawingId: string
  readonly targetKind: 'line' | 'area'
  readonly lineIndex: number
  readonly x: number
  readonly y: number
  /** 文字沿线段方向旋转的可读角度（弧度）。 */
  readonly rotation: number
  readonly text: string
}

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
        const screen = anchorToScreen(drawing.anchors[i]!, drawing.paneId, adapter)
        if (!screen || !isScreenPoint(screen)) continue
        const dx = mouseX - screen.x
        const dy = mouseY - screen.y
        if (dx * dx + dy * dy <= ANCHOR_HIT_RADIUS_SQ) {
          return { drawing, anchorIndex: i }
        }
      }
    }

    // Check line segment hits
    for (const drawing of visibleDrawings) {
      const segments = this.getDrawingLineSegments(drawing, adapter, regressionGeometryCache)
      for (const seg of segments) {
        if (pointToSegmentDistanceSq(mouseX, mouseY, seg.a, seg.b) <= LINE_HIT_RADIUS_SQ) {
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
      const screen = anchorToScreen(drawing.anchors[0]!, drawing.paneId, adapter)
      if (!screen) return []

      const paneInfo = adapter.getPaneInfo(drawing.paneId)
      if (!paneInfo) return []

      const right = viewport.plotWidth
      const bottom = paneInfo.height

      switch (drawing.kind) {
        case 'horizontal-line':
          if (screen.type !== 'horizontal') return []
          return [{ a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } }]
        case 'horizontal-ray':
          if (!isScreenPoint(screen)) return []
          return [{ a: screen, b: { x: right, y: screen.y } }]
        case 'vertical-line':
          if (screen.type !== 'vertical') return []
          return [{ a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } }]
        case 'cross-line':
          if (!isScreenPoint(screen)) return []
          return [
            { a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } },
            { a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } },
          ]
        default:
          return []
      }
    }

    // Multi-anchor drawings (2+)
    const points = drawing.anchors
      .map((anchor) => anchorToScreen(anchor, drawing.paneId, adapter))
      .filter((anchor): anchor is NonNullable<typeof anchor> => anchor !== null)
      .filter(isScreenPoint)
    if (points.length < 2) return []

    const segments: LineSegment[] = []

    if (points.length === 2) {
      const a = points[0]!
      const b = points[1]!

      if (drawing.kind === 'rectangle') {
        const left = Math.min(a.x, b.x)
        const right = Math.max(a.x, b.x)
        const top = Math.min(a.y, b.y)
        const bottom = Math.max(a.y, b.y)
        const topLeft = { x: left, y: top }
        const topRight = { x: right, y: top }
        const bottomRight = { x: right, y: bottom }
        const bottomLeft = { x: left, y: bottom }
        return [
          { a: topLeft, b: topRight },
          { a: topRight, b: bottomRight },
          { a: bottomRight, b: bottomLeft },
          { a: bottomLeft, b: topLeft },
        ]
      }

      if (drawing.kind === 'fib-retracement') {
        const ratios = (drawing.params as { levels?: number[] } | undefined)?.levels ?? [
          0, 0.236, 0.382, 0.5, 0.618, 0.786, 1,
        ]
        const left = Math.min(a.x, b.x)
        const right = Math.max(a.x, b.x)
        return ratios.map((ratio) => {
          const y = a.y + (b.y - a.y) * ratio
          return { a: { x: left, y }, b: { x: right, y } }
        })
      }

      if (drawing.kind === 'arrow') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x)
        const headLength = 10
        const headAngle = Math.PI / 6
        const headA = {
          x: b.x - headLength * Math.cos(angle - headAngle),
          y: b.y - headLength * Math.sin(angle - headAngle),
        }
        const headB = {
          x: b.x - headLength * Math.cos(angle + headAngle),
          y: b.y - headLength * Math.sin(angle + headAngle),
        }
        return [
          { a, b },
          { a: headA, b },
          { a: headB, b },
        ]
      }

      const dx = b.x - a.x
      const dy = b.y - a.y

      let start: { x: number; y: number } = a
      let end: { x: number; y: number } = b

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
          const [p1, p2, p3] = points as unknown as [
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
          const [p1, p2, p3] = points as unknown as [
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
          const [p1, p2, p3] = points as unknown as [
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

  /** 查找鼠标命中的线段中心区域，供宿主显示文本添加或编辑提示。 */
  findLineLabelTarget(
    mouseX: number,
    mouseY: number,
    drawings: ReadonlyArray<DrawingObject>,
    adapter: DrawingChartAdapter,
  ): LineLabelTarget | null {
    let closest: LineLabelTarget | null = null
    let closestDistanceSq = LINE_LABEL_TARGET_RADIUS_SQ
    for (const drawing of drawings) {
      const segments = this.getDrawingLabelSegments(drawing, adapter)
      for (const [lineIndex, segment] of segments.entries()) {
        const x = (segment.a.x + segment.b.x) / 2
        const y = (segment.a.y + segment.b.y) / 2
        const dx = mouseX - x
        const dy = mouseY - y
        const distanceSq = dx * dx + dy * dy
        if (distanceSq > closestDistanceSq) continue
        closestDistanceSq = distanceSq
        let rotation = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x)
        if (rotation > Math.PI / 2) rotation -= Math.PI
        if (rotation <= -Math.PI / 2) rotation += Math.PI
        closest = {
          drawingId: drawing.id,
          targetKind: 'line',
          lineIndex,
          x,
          y: y + (adapter.getPaneInfo(drawing.paneId)?.top ?? 0),
          rotation,
          text: getDrawingLineLabel(drawing, lineIndex) ?? '',
        }
      }
    }
    return closest
  }

  /** 查找填充图元的中心文本热点。 */
  findAreaLabelTarget(
    mouseX: number,
    mouseY: number,
    drawings: ReadonlyArray<DrawingObject>,
    adapter: DrawingChartAdapter,
  ): LineLabelTarget | null {
    for (const drawing of drawings) {
      if (
        ![
          'rectangle',
          'parallel-channel',
          'regression-channel',
          'flat-line',
          'disjoint-channel',
        ].includes(drawing.kind)
      )
        continue
      const segments = this.getDrawingLineSegments(drawing, adapter)
      if (segments.length === 0) continue
      const points = segments.flatMap((segment) => [segment.a, segment.b])
      const x =
        (Math.min(...points.map((point) => point.x)) +
          Math.max(...points.map((point) => point.x))) /
        2
      const y =
        (Math.min(...points.map((point) => point.y)) +
          Math.max(...points.map((point) => point.y))) /
        2
      const dx = mouseX - x
      const dy = mouseY - y
      if (dx * dx + dy * dy > LINE_LABEL_TARGET_RADIUS_SQ) continue
      return {
        drawingId: drawing.id,
        targetKind: 'area',
        lineIndex: 0,
        x,
        y: y + (adapter.getPaneInfo(drawing.paneId)?.top ?? 0),
        rotation: 0,
        text: getDrawingAreaLabel(drawing, 0) ?? '',
      }
    }
    return null
  }

  /** 返回文本热点对应的线段；射线和延长线始终使用原始两锚点之间的线段。 */
  private getDrawingLabelSegments(
    drawing: DrawingObject,
    adapter: DrawingChartAdapter,
  ): LineSegment[] {
    if (
      (drawing.kind === 'ray' || drawing.kind === 'extended-line') &&
      drawing.anchors.length === 2
    ) {
      const [first, second] = drawing.anchors
      const a = first ? anchorToScreen(first, drawing.paneId, adapter) : null
      const b = second ? anchorToScreen(second, drawing.paneId, adapter) : null
      return isScreenPoint(a) && isScreenPoint(b) ? [{ a, b }] : []
    }
    return this.getDrawingLineSegments(drawing, adapter)
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

    const firstTimestamp = Number(drawing.anchors[0]!.time)
    const secondTimestamp = Number(drawing.anchors[1]!.time)
    const firstIndex = adapter.getLogicalIndexAtTimestamp(firstTimestamp)
    const secondIndex = adapter.getLogicalIndexAtTimestamp(secondTimestamp)
    if (firstIndex === null || secondIndex === null) {
      cache?.set(drawing.id, null)
      return null
    }
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

    const middleStart = anchorToScreen(
      { id: '', time: firstTimestamp, price: firstValue },
      drawing.paneId,
      adapter,
    )
    const middleEnd = anchorToScreen(
      { id: '', time: secondTimestamp, price: lastValue },
      drawing.paneId,
      adapter,
    )
    const upperStart = anchorToScreen(
      { id: '', time: firstTimestamp, price: firstValue + offset },
      drawing.paneId,
      adapter,
    )
    const upperEnd = anchorToScreen(
      { id: '', time: secondTimestamp, price: lastValue + offset },
      drawing.paneId,
      adapter,
    )
    const lowerStart = anchorToScreen(
      { id: '', time: firstTimestamp, price: firstValue - offset },
      drawing.paneId,
      adapter,
    )
    const lowerEnd = anchorToScreen(
      { id: '', time: secondTimestamp, price: lastValue - offset },
      drawing.paneId,
      adapter,
    )

    const segments: LineSegment[] = []
    if (isScreenPoint(middleStart) && isScreenPoint(middleEnd)) {
      segments.push({ a: middleStart, b: middleEnd })
    }
    if (isScreenPoint(upperStart) && isScreenPoint(upperEnd)) {
      segments.push({ a: upperStart, b: upperEnd })
    }
    if (isScreenPoint(lowerStart) && isScreenPoint(lowerEnd)) {
      segments.push({ a: lowerStart, b: lowerEnd })
    }

    const endpoints: RegressionChannelGeometry['endpoints'] = []
    if (isScreenPoint(middleStart)) endpoints.push({ point: middleStart, anchorIndex: 0 })
    if (isScreenPoint(middleEnd)) endpoints.push({ point: middleEnd, anchorIndex: 1 })
    if (isScreenPoint(upperStart)) endpoints.push({ point: upperStart, anchorIndex: 0 })
    if (isScreenPoint(upperEnd)) endpoints.push({ point: upperEnd, anchorIndex: 1 })
    if (isScreenPoint(lowerStart)) endpoints.push({ point: lowerStart, anchorIndex: 0 })
    if (isScreenPoint(lowerEnd)) endpoints.push({ point: lowerEnd, anchorIndex: 1 })

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
      const dx = mouseX - endpoint.point.x
      const dy = mouseY - endpoint.point.y
      if (dx * dx + dy * dy <= ANCHOR_HIT_RADIUS_SQ) {
        return { drawing, anchorIndex: endpoint.anchorIndex }
      }
    }

    return null
  }
}
