import type { DrawingViewportPort } from '@/controllers/types.js'
import {
  type Point,
  pointInCircle,
  pointInPolygon,
  pointToSegmentDistanceSq,
} from '@/foundation/geometry/index.js'
import { arrowHead } from '../../geometry/impl/arrowGeometry.js'
import { anchorToScreen, isScreenPoint } from '../../geometry/impl/coordinateUtils.js'
import { fibLevelLines } from '../../geometry/impl/fibLevels.js'
import { buildFillPolygon } from '../../geometry/impl/fillRegions.js'
import {
  LINE_LABEL_BASELINE,
  resolveAreaLabelLayout,
  resolveLineLabelLayout,
} from '../../geometry/impl/labelLayout.js'
import { getLines } from '../../geometry/impl/lines.js'
import { computeRegressionChannel } from '../../geometry/impl/regressionChannel.js'
import type { DrawingLine } from '../../geometry/types.js'
import { resolveDrawingHandles } from '../../handles/impl/layout.js'
import type { DrawingHandle, DrawingHandlePort } from '../../handles/types.js'
import { drawingLabelIndexKey } from '../../model/impl/drawingLabels.js'
import type { DrawingLabel, DrawingObject } from '../../types.js'
import type { DrawingDragTarget, HitResult, LineLabelTarget } from '../types.js'
import { CHANNEL_KINDS, getExtendMode } from './toolConfig.js'

// ---- Types ----

/** 二维线段，两端点为屏幕坐标（px）。 */
export interface LineSegment {
  a: Point
  b: Point
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
/** 线段点击命中半径（px） */
const LINE_HIT_RADIUS = 6
const LINE_HIT_RADIUS_SQ = LINE_HIT_RADIUS * LINE_HIT_RADIUS
/** 线段中心文本热点半径（px）。 */
const LINE_LABEL_TARGET_RADIUS = 18
const LINE_LABEL_TARGET_RADIUS_SQ = LINE_LABEL_TARGET_RADIUS * LINE_LABEL_TARGET_RADIUS
let labelMeasureContext: CanvasRenderingContext2D | null | undefined

function labelTextWidth(text: string, fontSize: number): number {
  if (labelMeasureContext === undefined) {
    labelMeasureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (labelMeasureContext) {
    labelMeasureContext.font = `${fontSize}px sans-serif`
    return labelMeasureContext.measureText(text).width
  }
  return [...text].reduce((sum, char) => sum + fontSize * (char.charCodeAt(0) > 255 ? 1 : 0.65), 0)
}

/** Existing text is clickable across its rendered footprint, not just near its anchor. */
function labelHitDistanceSq(
  mouseX: number,
  mouseY: number,
  x: number,
  y: number,
  text: string | undefined,
  fontSize: number,
  align: CanvasTextAlign,
  baseline: 'bottom' | 'middle',
  rotation = 0,
): number {
  const dx = mouseX - x
  const dy = mouseY - y
  const anchorDistanceSq = dx * dx + dy * dy
  if (!text || anchorDistanceSq <= LINE_LABEL_TARGET_RADIUS_SQ) return anchorDistanceSq

  const lines = text.split('\\n')
  const width = Math.max(...lines.map((line) => labelTextWidth(line, fontSize)))
  const height = lines.length * fontSize * 1.2
  const localX = dx * Math.cos(rotation) + dy * Math.sin(rotation)
  const localY = -dx * Math.sin(rotation) + dy * Math.cos(rotation)
  const left = labelLeftOffset(align, width)
  const top = baseline === 'bottom' ? -height : -height / 2
  return isInsideLabelBox(localX, localY, left, top, width, height) ? 0 : anchorDistanceSq
}

/** 按对齐方式把文本宽度换算为左边界偏移。 */
function labelLeftOffset(align: CanvasTextAlign, width: number): number {
  if (align === 'left') return 0
  return align === 'right' ? -width : -width / 2
}

/** 文本命中区按 5px 外扩，旋转后仍在局部坐标系比较。 */
function isInsideLabelBox(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  const padding = 5
  return (
    x >= left - padding &&
    x <= left + width + padding &&
    y >= top - padding &&
    y <= top + height + padding
  )
}

/** 单锚点图元的屏幕线段；类型不匹配时不参与命中。 */
type ScreenAnchor = ReturnType<typeof anchorToScreen>

function horizontalLineSegment(screen: ScreenAnchor, right: number): LineSegment[] {
  if (!screen || screen.type !== 'horizontal') return []
  return [{ a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } }]
}

function horizontalRaySegment(screen: ScreenAnchor, right: number): LineSegment[] {
  if (!isScreenPoint(screen)) return []
  return [{ a: screen, b: { x: right, y: screen.y } }]
}

function verticalLineSegment(screen: ScreenAnchor, bottom: number): LineSegment[] {
  if (!screen || screen.type !== 'vertical') return []
  return [{ a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } }]
}

function crossLineSegments(screen: ScreenAnchor, right: number, bottom: number): LineSegment[] {
  if (!isScreenPoint(screen)) return []
  return [
    { a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } },
    { a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } },
  ]
}

/** 未传选中集合时手柄一律不参与命中：手柄只在选中态可见。 */
const NO_SELECTION: ReadonlySet<string> = new Set()

import { isDrawingInteractive } from '@363045841yyt/klinechart-plot-contracts'

/**
 * Hit detection — test mouse position against drawing anchors and line segments.
 * Pure computation, no side effects.
 */
export class HitTester {
  /**
   * Find the drawing (and its drag target) under the given mouse position.
   * 优先级：锚点 > 线段中点手柄 > 线身（整体拖拽）。
   * 两类手柄由手柄布局一次解析，命中顺序即布局顺序；中点手柄只在选中态出现，
   * 未选中时中点按线身命中。
   */
  hitTest(
    mouseX: number,
    mouseY: number,
    drawings: DrawingObject[],
    adapter: DrawingViewportPort,
    selectedDrawingIds: ReadonlySet<string> = NO_SELECTION,
  ): HitResult | null {
    const visibleDrawings = drawings.filter((d) => d.visible && isDrawingInteractive(d))
    const regressionGeometryCache = new Map<string, RegressionChannelGeometry | null>()
    const pointer: Point = { x: mouseX, y: mouseY }
    return (
      this.hitTestHandles(
        visibleDrawings,
        pointer,
        adapter,
        selectedDrawingIds,
        regressionGeometryCache,
      ) ??
      this.hitTestLineSegments(visibleDrawings, mouseX, mouseY, adapter, regressionGeometryCache) ??
      this.hitTestFillRegions(visibleDrawings, pointer, adapter)
    )
  }

  /** 锚点、线段中点手柄与回归通道端点优先参与命中。 */
  private hitTestHandles(
    drawings: DrawingObject[],
    pointer: Point,
    adapter: DrawingViewportPort,
    selectedDrawingIds: ReadonlySet<string>,
    regressionGeometryCache: Map<string, RegressionChannelGeometry | null>,
  ): HitResult | null {
    for (const drawing of drawings) {
      // regression-channel 的计算端点同样可拖拽。
      if (drawing.kind === 'regression-channel' && drawing.anchors.length >= 2) {
        const hit = this.hitTestRegressionEndpoints(
          drawing,
          pointer.x,
          pointer.y,
          adapter,
          regressionGeometryCache,
        )
        if (hit) return hit
      }
      const handles = resolveDrawingHandles(drawing, this.createHandlePort(drawing, adapter), {
        selected: selectedDrawingIds.has(drawing.id),
      })
      for (const handle of handles) {
        if (pointInCircle(pointer, handle.point, DRAG_POINT_HIT_RADIUS)) {
          return { drawing, target: toDragTarget(handle), cursor: handle.cursor }
        }
      }
    }
    return null
  }

  /** 线身命中的优先级低于手柄。 */
  private hitTestLineSegments(
    drawings: readonly DrawingObject[],
    mouseX: number,
    mouseY: number,
    adapter: DrawingViewportPort,
    regressionGeometryCache: Map<string, RegressionChannelGeometry | null>,
  ): HitResult | null {
    for (const drawing of drawings) {
      const segments = this.getDrawingLineSegments(drawing, adapter, regressionGeometryCache)
      for (const segment of segments) {
        if (pointToSegmentDistanceSq(mouseX, mouseY, segment.a, segment.b) <= LINE_HIT_RADIUS_SQ) {
          return { drawing, target: { type: 'all' }, cursor: 'move' }
        }
      }
    }
    return null
  }

  /** 通道填充与线身同属图元主体，落在内部也整体拖拽。 */
  private hitTestFillRegions(
    drawings: readonly DrawingObject[],
    pointer: Point,
    adapter: DrawingViewportPort,
  ): HitResult | null {
    for (const drawing of drawings) {
      const polygon = this.getDrawingFillPolygon(drawing, adapter)
      if (polygon.length >= 3 && pointInPolygon(pointer, polygon)) {
        return { drawing, target: { type: 'all' }, cursor: 'move' }
      }
    }
    return null
  }

  /** 命中侧的投影端口：锚点经视口适配器投影，边界取当前 Pane 尺寸。 */
  private createHandlePort(
    drawing: DrawingObject,
    adapter: DrawingViewportPort,
  ): DrawingHandlePort {
    const viewport = adapter.getViewport()
    const pane = adapter.getPaneInfo(drawing.paneId)
    return {
      bounds: viewport && pane ? { plotWidth: viewport.plotWidth, paneHeight: pane.height } : null,
      projectAnchor: (anchor) => anchorToScreen(anchor, drawing.paneId, adapter),
    }
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

    if (drawing.kind === 'regression-channel')
      return (
        this.getRegressionChannelGeometry(drawing, adapter, regressionGeometryCache)?.segments ?? []
      )

    // 组合图元：线由线表（LINES）的锚点对定义，不再按锚点顺序推导。
    const lines = getLines(drawing.kind)
    if (lines.length > 0) return this.getPairedLineSegments(drawing, lines, adapter)

    if (drawing.anchors.length === 1)
      return this.getSingleAnchorSegments(drawing, adapter, viewport.plotWidth)
    return this.getTwoAnchorSegments(drawing, adapter, viewport.plotWidth, viewport.plotHeight)
  }

  /** 单锚点图元：横线/竖线/十字线沿 pane 边界延伸。 */
  private getSingleAnchorSegments(
    drawing: DrawingObject,
    adapter: DrawingViewportPort,
    right: number,
  ): LineSegment[] {
    const screen = anchorToScreen(drawing.anchors[0]!, drawing.paneId, adapter)
    if (!screen) return []

    const paneInfo = adapter.getPaneInfo(drawing.paneId)
    if (!paneInfo) return []

    const bottom = paneInfo.height
    if (drawing.kind === 'horizontal-line') return horizontalLineSegment(screen, right)
    if (drawing.kind === 'horizontal-ray') return horizontalRaySegment(screen, right)
    if (drawing.kind === 'vertical-line') return verticalLineSegment(screen, bottom)
    if (drawing.kind === 'cross-line') return crossLineSegments(screen, right, bottom)
    return []
  }

  /** 两锚点图元：专属线段优先，其余按 extend 延长。 */
  private getTwoAnchorSegments(
    drawing: DrawingObject,
    adapter: DrawingViewportPort,
    plotWidth: number,
    plotHeight: number,
  ): LineSegment[] {
    const points = drawing.anchors
      .map((anchor) => anchorToScreen(anchor, drawing.paneId, adapter))
      .filter(isScreenPoint)
    if (points.length < 2) return []

    const a = points[0]!
    const b = points[1]!
    return (
      resolveTwoAnchorSegments(drawing, a, b) ?? [
        extendSegment(drawing, a, b, plotWidth, plotHeight),
      ]
    )
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
  private getDrawingFillPolygon(drawing: DrawingObject, adapter: DrawingViewportPort): Point[] {
    const anchorsOnScreen: Point[] = []
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
      if (!isDrawingInteractive(drawing)) continue
      const segments = this.getDrawingLabelSegments(drawing, adapter)
      const line = findLineLabelTarget(
        drawing,
        segments,
        adapter,
        mouseX,
        mouseY,
        closestLineDistanceSq,
      )
      if (line) {
        closestLine = line.target
        closestLineDistanceSq = line.distanceSq
      }
      if (!areaTarget) areaTarget = findAreaLabelTarget(drawing, segments, adapter, mouseX, mouseY)
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
    const geometry = buildRegressionChannelGeometry(drawing, adapter)
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

    const pointer: Point = { x: mouseX, y: mouseY }
    for (const endpoint of geometry.endpoints) {
      if (pointInCircle(pointer, endpoint.point, DRAG_POINT_HIT_RADIUS)) {
        return {
          drawing,
          target: { type: 'anchor', index: endpoint.anchorIndex },
          cursor: 'default',
        }
      }
    }

    return null
  }
}

/** 手柄行 → 拖拽目标；命中与拖拽共用同一份布局结果，不各自推导。 */
function toDragTarget(handle: DrawingHandle): DrawingDragTarget {
  return handle.kind === 'anchor'
    ? { type: 'anchor', index: handle.anchorIndex }
    : { type: 'line-handle', lineIndex: handle.lineIndex }
}

/** 矩形/斐波那契/箭头的专属命中线段；其他两锚点图元返回 null。 */
function resolveTwoAnchorSegments(
  drawing: DrawingObject,
  a: Point,
  b: Point,
): LineSegment[] | null {
  if (drawing.kind === 'fib-retracement')
    return fibLevelLines(drawing.params, a, b).map((level) => ({
      a: { x: level.left, y: level.y },
      b: { x: level.right, y: level.y },
    }))
  if (drawing.kind === 'arrow') {
    const head = arrowHead(a, b)
    return [
      { a, b },
      { a: head.left, b },
      { a: head.right, b },
    ]
  }
  return null
}

/** 按图元自身的 extend 或 kind 默认延长两锚点线段。 */
function extendSegment(
  drawing: DrawingObject,
  a: Point,
  b: Point,
  plotWidth: number,
  plotHeight: number,
): LineSegment {
  const extend = drawing.extend ?? getExtendMode(drawing.kind)
  const maxLen = Math.max(plotWidth, plotHeight) * 4
  const dx = b.x - a.x
  const dy = b.y - a.y
  const start =
    extend === 'left' || extend === 'both' ? { x: a.x - dx * maxLen, y: a.y - dy * maxLen } : a
  const end =
    extend === 'right' || extend === 'both' ? { x: b.x + dx * maxLen, y: b.y + dy * maxLen } : b
  return { a: start, b: end }
}

/** 构造线段文本热点目标。 */
function createLineLabelTarget(
  drawing: DrawingObject,
  label: DrawingLabel | undefined,
  layout: ReturnType<typeof resolveLineLabelLayout>,
  lineIndex: number,
  adapter: DrawingViewportPort,
  fontSize: number,
): LineLabelTarget {
  return {
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
    fontSize,
  }
}

/** 单条线段的中线文本候选。 */
function buildLineLabelCandidate(
  drawing: DrawingObject,
  segment: LineSegment,
  lineIndex: number,
  adapter: DrawingViewportPort,
  mouseX: number,
  mouseY: number,
): { target: LineLabelTarget; distanceSq: number } {
  const label = drawing.labels?.line[drawingLabelIndexKey(lineIndex)]
  const layout = resolveLineLabelLayout(segment.a, segment.b, label?.position)
  const fontSize = drawing.style.fontSize ?? 12
  return {
    distanceSq: labelHitDistanceSq(
      mouseX,
      mouseY,
      layout.x,
      layout.y,
      label?.text,
      fontSize,
      layout.align,
      'bottom',
      layout.rotation,
    ),
    target: createLineLabelTarget(drawing, label, layout, lineIndex, adapter, fontSize),
  }
}

/** 线段中点文本热点：取半径内最近的一条。 */
function findLineLabelTarget(
  drawing: DrawingObject,
  segments: readonly LineSegment[],
  adapter: DrawingViewportPort,
  mouseX: number,
  mouseY: number,
  threshold: number,
): { target: LineLabelTarget; distanceSq: number } | null {
  let best: { target: LineLabelTarget; distanceSq: number } | null = null
  for (const [lineIndex, segment] of segments.entries()) {
    const candidate = buildLineLabelCandidate(drawing, segment, lineIndex, adapter, mouseX, mouseY)
    if (candidate.distanceSq > threshold) continue
    threshold = candidate.distanceSq
    best = candidate
  }
  return best
}

/** 通道填充文本热点的几何中心与对齐方式。 */
function readAreaLabelGeometry(
  drawing: DrawingObject,
  segments: readonly LineSegment[],
): { x: number; y: number; position: LineLabelTarget['position']; align: CanvasTextAlign } | null {
  if (segments.length === 0 || !CHANNEL_KINDS.includes(drawing.kind)) return null
  const points = segments.flatMap((segment) => [segment.a, segment.b])
  const position = drawing.labels?.area['0']?.position ?? 'center'
  const layout = resolveAreaLabelLayout(
    Math.min(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.x)),
    position,
  )
  const y =
    (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2
  return { x: layout.x, y, position, align: layout.align }
}

/** 填充图元的文本热点：用线段包围盒中心，只对通道类图元生效。 */
function findAreaLabelTarget(
  drawing: DrawingObject,
  segments: readonly LineSegment[],
  adapter: DrawingViewportPort,
  mouseX: number,
  mouseY: number,
): LineLabelTarget | null {
  const geometry = readAreaLabelGeometry(drawing, segments)
  if (!geometry) return null
  const text = drawing.labels?.area['0']?.text
  const fontSize = drawing.style.fontSize ?? 12
  const distanceSq = labelHitDistanceSq(
    mouseX,
    mouseY,
    geometry.x,
    geometry.y,
    text,
    fontSize,
    geometry.align,
    'middle',
  )
  if (distanceSq > LINE_LABEL_TARGET_RADIUS_SQ) return null
  return {
    drawingId: drawing.id,
    targetKind: 'area',
    lineIndex: 0,
    x: geometry.x,
    y: geometry.y + (adapter.getPaneInfo(drawing.paneId)?.top ?? 0),
    rotation: 0,
    text: text ?? '',
    position: geometry.position,
    align: geometry.align,
    baseline: 'middle',
    fontSize,
  }
}

/** 读取锚点索引并计算回归通道；数据或锚点不足时返回 null。 */
function buildRegressionChannelGeometry(
  drawing: DrawingObject,
  adapter: DrawingViewportPort,
): RegressionChannelGeometry | null {
  const data = adapter.getData()
  if (data.length === 0 || drawing.anchors.length < 2) return null
  const firstTimestamp = Number(drawing.anchors[0]!.time)
  const secondTimestamp = Number(drawing.anchors[1]!.time)
  const coordinates = adapter.getCoordinates(drawing.paneId)
  if (!coordinates) return null
  const firstIndex = coordinates.timeToSlot(firstTimestamp)
  const secondIndex = coordinates.timeToSlot(secondTimestamp)
  if (firstIndex === null || secondIndex === null) return null
  const clampedFirst = Math.round(firstIndex)
  const clampedSecond = Math.round(secondIndex)
  const params = drawing.params
  const sigma = typeof params?.sigma === 'number' ? params.sigma : 2
  const regression = computeRegressionChannel(
    data.map((item: { close: number }) => item.close),
    clampedFirst,
    clampedSecond,
    sigma,
  )
  if (!regression) return null
  return projectRegressionGeometry(
    drawing,
    adapter,
    firstTimestamp,
    secondTimestamp,
    regression.firstValue,
    regression.secondValue,
    regression.offset,
  )
}

/** 把回归通道的三条线投影为屏幕线段与可拖拽端点。 */
function projectRegressionGeometry(
  drawing: DrawingObject,
  adapter: DrawingViewportPort,
  firstTimestamp: number,
  secondTimestamp: number,
  firstValue: number,
  secondValue: number,
  offset: number,
): RegressionChannelGeometry {
  const at = (timestamp: number, price: number) =>
    anchorToScreen({ time: timestamp, price }, drawing.paneId, adapter)
  const middleStart = at(firstTimestamp, firstValue)
  const middleEnd = at(secondTimestamp, secondValue)
  const upperStart = at(firstTimestamp, firstValue + offset)
  const upperEnd = at(secondTimestamp, secondValue + offset)
  const lowerStart = at(firstTimestamp, firstValue - offset)
  const lowerEnd = at(secondTimestamp, secondValue - offset)

  const segments: LineSegment[] = []
  const addSegment = (a: ReturnType<typeof at>, b: ReturnType<typeof at>) => {
    if (isScreenPoint(a) && isScreenPoint(b)) segments.push({ a, b })
  }
  addSegment(middleStart, middleEnd)
  addSegment(upperStart, upperEnd)
  addSegment(lowerStart, lowerEnd)

  const endpoints: RegressionChannelGeometry['endpoints'] = []
  const addEndpoint = (point: ReturnType<typeof at>, anchorIndex: 0 | 1) => {
    if (isScreenPoint(point)) endpoints.push({ point, anchorIndex })
  }
  addEndpoint(middleStart, 0)
  addEndpoint(middleEnd, 1)
  addEndpoint(upperStart, 0)
  addEndpoint(upperEnd, 1)
  addEndpoint(lowerStart, 0)
  addEndpoint(lowerEnd, 1)

  return { segments, endpoints }
}
