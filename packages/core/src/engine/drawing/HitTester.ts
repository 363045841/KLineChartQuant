import type { DrawingViewportPort } from '../../controllers/types.js'
import type { DrawingObject, ScreenPoint } from '../../foundation/plugin/index.js'

import {
  anchorToScreen,
  isScreenPoint,
  midpoint,
  pointInPolygon,
  pointToSegmentDistanceSq,
} from './coordinateUtils.js'
import { drawingLabelIndexKey } from './drawingLabels.js'
import { buildFillPolygon } from './fillRegions.js'
import { LINE_LABEL_BASELINE, resolveLineLabelLayout } from './labelLayout.js'
import { computeLinearRegression } from './linearRegression.js'
import type { DrawingLine, VerticalHandleLine } from './lines.js'
import { getLines, getVerticalHandleLines } from './lines.js'
import { CHANNEL_KINDS, getExtendMode } from './toolConfig.js'

// ---- Types ----

/** 命中的拖拽目标：锚点、线段中点垂直手柄，或图元主体（整体拖拽）。命中与拖拽会话共用。 */
export type DrawingDragTarget =
  | { readonly type: 'anchor'; readonly index: number }
  | { readonly type: 'vertical-handle'; readonly lineIndex: number }
  | { readonly type: 'all' }

/** 命中检测结果：命中的图元及其拖拽目标。 */
export interface HitResult {
  readonly drawing: DrawingObject
  readonly target: DrawingDragTarget
}

/** 二维线段，两端点为屏幕坐标（px）。 */
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

/** 可拖拽点（锚点、线段中点手柄）的点击命中半径（px） */
const DRAG_POINT_HIT_RADIUS = 8
const DRAG_POINT_HIT_RADIUS_SQ = DRAG_POINT_HIT_RADIUS * DRAG_POINT_HIT_RADIUS
/** 线段点击命中半径（px） */
const LINE_HIT_RADIUS = 6
const LINE_HIT_RADIUS_SQ = LINE_HIT_RADIUS * LINE_HIT_RADIUS
/** 线段中心文本热点半径（px）。 */
const LINE_LABEL_TARGET_RADIUS = 18
const LINE_LABEL_TARGET_RADIUS_SQ = LINE_LABEL_TARGET_RADIUS * LINE_LABEL_TARGET_RADIUS

/** 未传选中集合时手柄一律不参与命中：手柄只在选中态可见。 */
const NO_SELECTION: ReadonlySet<string> = new Set()

/** 线段/填充标签热点，携带与绘制完全一致的锚点、旋转、对齐、基线与字号。 */
export interface LineLabelTarget {
  readonly drawingId: string
  readonly targetKind: 'line' | 'area'
  readonly lineIndex: number
  readonly x: number
  readonly y: number
  /** 文字沿线段方向的可读旋转角（弧度）。 */
  readonly rotation: number
  readonly text: string
  readonly position: import('../../foundation/plugin/index.js').DrawingLabelPosition
  /** 绘制时的水平对齐。 */
  readonly align: CanvasTextAlign
  /** 绘制时的基线，决定锚点贴文本块的哪一边。 */
  readonly baseline: CanvasTextBaseline
  /** 绘制时的字号（px）。 */
  readonly fontSize: number
}

/**
 * Hit detection — test mouse position against drawing anchors and line segments.
 * Pure computation, no side effects.
 */
export class HitTester {
  /**
   * Find the drawing (and its drag target) under the given mouse position.
   * 优先级：锚点 > 线段中点手柄 > 线身（整体拖拽）。
   * 中点手柄只在图元被选中时可见，因此也只在选中时参与命中；未选中时中点按线身命中。
   */
  hitTest(
    mouseX: number,
    mouseY: number,
    drawings: DrawingObject[],
    adapter: DrawingViewportPort,
    selectedDrawingIds: ReadonlySet<string> = NO_SELECTION,
  ): HitResult | null {
    const visibleDrawings = drawings.filter((d) => d.visible)
    const regressionGeometryCache = new Map<string, RegressionChannelGeometry | null>()

    // Check anchor and vertical-handle hits first
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
        if (!isScreenPoint(screen)) continue
        const dx = mouseX - screen.x
        const dy = mouseY - screen.y
        if (dx * dx + dy * dy <= DRAG_POINT_HIT_RADIUS_SQ) {
          return { drawing, target: { type: 'anchor', index: i } }
        }
      }

      if (selectedDrawingIds.has(drawing.id)) {
        const hit = this.hitTestVerticalHandles(drawing, mouseX, mouseY, adapter)
        if (hit) return hit
      }
    }

    // Check line segment hits
    for (const drawing of visibleDrawings) {
      const segments = this.getDrawingLineSegments(drawing, adapter, regressionGeometryCache)
      for (const seg of segments) {
        if (pointToSegmentDistanceSq(mouseX, mouseY, seg.a, seg.b) <= LINE_HIT_RADIUS_SQ) {
          return { drawing, target: { type: 'all' } }
        }
      }
    }

    // Check fill region hits：通道类组合图元的填充与线身同属「图元主体」，落在内部也整体拖拽。
    for (const drawing of visibleDrawings) {
      const polygon = this.getDrawingFillPolygon(drawing, adapter)
      if (polygon.length >= 3 && pointInPolygon({ x: mouseX, y: mouseY }, polygon)) {
        return { drawing, target: { type: 'all' } }
      }
    }

    return null
  }

  /** 线段中点垂直手柄命中：只有开启手柄的线参与。 */
  private hitTestVerticalHandles(
    drawing: DrawingObject,
    mouseX: number,
    mouseY: number,
    adapter: DrawingViewportPort,
  ): HitResult | null {
    for (const line of getVerticalHandleLines(drawing.kind)) {
      const point = this.getVerticalHandlePoint(drawing, line, adapter)
      if (!point) continue
      const dx = mouseX - point.x
      const dy = mouseY - point.y
      if (dx * dx + dy * dy <= DRAG_POINT_HIT_RADIUS_SQ) {
        return { drawing, target: { type: 'vertical-handle', lineIndex: line.index } }
      }
    }
    return null
  }

  /** 线段中点手柄的屏幕位置；两端锚点任一不可投影时返回 null。 */
  private getVerticalHandlePoint(
    drawing: DrawingObject,
    line: VerticalHandleLine,
    adapter: DrawingViewportPort,
  ): ScreenPoint | null {
    const from = drawing.anchors[line.from]
    const to = drawing.anchors[line.to]
    if (!from || !to) return null
    const a = anchorToScreen(from, drawing.paneId, adapter)
    const b = anchorToScreen(to, drawing.paneId, adapter)
    if (!isScreenPoint(a) || !isScreenPoint(b)) return null
    return midpoint(a, b)
  }

  /**
   * Get the screen-space line segments for a drawing, used for hit-testing.
   */
  getDrawingLineSegments(
    drawing: DrawingObject,
    adapter: DrawingViewportPort,
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

    // 组合图元：线由线表（LINES）的锚点对定义，不再按锚点顺序推导。
    const lines = getLines(drawing.kind)
    if (lines.length > 0) return this.getPairedLineSegments(drawing, lines, adapter)

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

    // 两锚点图元：线段直接由两个锚点派生（矩形四条边 / 斐波那契水平线 / 箭头等）。
    const points = drawing.anchors
      .map((anchor) => anchorToScreen(anchor, drawing.paneId, adapter))
      .filter(isScreenPoint)
    if (points.length < 2) return []
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

    return [{ a: start, b: end }]
  }

  /** 组合图元的线段：由线表（LINES）的锚点对直接构成。 */
  private getPairedLineSegments(
    drawing: DrawingObject,
    lines: readonly DrawingLine[],
    adapter: DrawingViewportPort,
  ): LineSegment[] {
    const segments: LineSegment[] = []
    for (const line of lines) {
      const from = drawing.anchors[line.from]
      const to = drawing.anchors[line.to]
      if (!from || !to) continue
      const a = anchorToScreen(from, drawing.paneId, adapter)
      const b = anchorToScreen(to, drawing.paneId, adapter)
      if (!isScreenPoint(a) || !isScreenPoint(b)) continue
      segments.push({ a, b })
    }
    return segments
  }

  /** 组合图元的填充多边形：所有锚点可投影时按登记的环绕顺序成环，否则不参与命中。 */
  private getDrawingFillPolygon(
    drawing: DrawingObject,
    adapter: DrawingViewportPort,
  ): ScreenPoint[] {
    const anchorsOnScreen: ScreenPoint[] = []
    for (const anchor of drawing.anchors) {
      const screen = anchorToScreen(anchor, drawing.paneId, adapter)
      if (!isScreenPoint(screen)) return []
      anchorsOnScreen.push(screen)
    }
    return buildFillPolygon(drawing.kind, anchorsOnScreen)
  }

  /**
   * 查找鼠标命中的文本热点，供宿主显示文本添加或编辑提示。
   *
   * 单遍遍历候选图元，每条图元的线段只投影一次，同时求两类热点：
   * - line：线段按 labels.line 的 position 取点、沿上侧法线偏移（与绘制文字同锚点），取半径内最近者；
   * - area：填充图元（CHANNEL_KINDS）的线段包围盒中心，取遍历首个。
   * line 优先级高于 area，两者都命中时返回 line。
   */
  findLabelTarget(
    mouseX: number,
    mouseY: number,
    drawings: ReadonlyArray<DrawingObject>,
    adapter: DrawingViewportPort,
  ): LineLabelTarget | null {
    let closestLine: LineLabelTarget | null = null
    let closestLineDistanceSq = LINE_LABEL_TARGET_RADIUS_SQ
    let areaTarget: LineLabelTarget | null = null

    for (const drawing of drawings) {
      const segments = this.getDrawingLabelSegments(drawing, adapter)

      for (const [lineIndex, segment] of segments.entries()) {
        const label = drawing.labels?.line[drawingLabelIndexKey(lineIndex)]
        const layout = resolveLineLabelLayout(segment.a, segment.b, label?.position)
        const dx = mouseX - layout.x
        const dy = mouseY - layout.y
        const distanceSq = dx * dx + dy * dy
        if (distanceSq > closestLineDistanceSq) continue
        closestLineDistanceSq = distanceSq
        closestLine = {
          drawingId: drawing.id,
          targetKind: 'line',
          lineIndex,
          x: layout.x,
          y: layout.y + (adapter.getPaneInfo(drawing.paneId)?.top ?? 0),
          rotation: layout.rotation,
          text: label?.text ?? '',
          position: label?.position ?? 'center',
          align: layout.align,
          baseline: LINE_LABEL_BASELINE,
          fontSize: drawing.style.fontSize ?? 12,
        }
      }

      // 填充图元用同一批线段求包围盒中心；CHANNEL_KINDS 不含 ray/extended-line，
      // 故 getDrawingLabelSegments 与其延长线段一致。已找到首个 area 热点便不再重算。
      if (areaTarget || segments.length === 0 || !CHANNEL_KINDS.includes(drawing.kind)) continue
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
      areaTarget = {
        drawingId: drawing.id,
        targetKind: 'area',
        lineIndex: 0,
        x,
        y: y + (adapter.getPaneInfo(drawing.paneId)?.top ?? 0),
        rotation: 0,
        text: drawing.labels?.area['0']?.text ?? '',
        position: drawing.labels?.area['0']?.position ?? 'center',
        align: 'center',
        baseline: 'middle',
        fontSize: drawing.style.fontSize ?? 12,
      }
    }

    return closestLine ?? areaTarget
  }

  /** 返回文本热点对应的线段；射线和延长线始终使用原始两锚点之间的线段。 */
  private getDrawingLabelSegments(
    drawing: DrawingObject,
    adapter: DrawingViewportPort,
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
    adapter: DrawingViewportPort,
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
    adapter: DrawingViewportPort,
    cache?: Map<string, RegressionChannelGeometry | null>,
  ): HitResult | null {
    const geometry = this.getRegressionChannelGeometry(drawing, adapter, cache)
    if (!geometry) return null

    for (const endpoint of geometry.endpoints) {
      const dx = mouseX - endpoint.point.x
      const dy = mouseY - endpoint.point.y
      if (dx * dx + dy * dy <= DRAG_POINT_HIT_RADIUS_SQ) {
        return { drawing, target: { type: 'anchor', index: endpoint.anchorIndex } }
      }
    }

    return null
  }
}
