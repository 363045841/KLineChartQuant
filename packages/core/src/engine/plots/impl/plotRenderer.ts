/** 通用 Plot Layer：按绘图类型投影到 Pane 坐标，线条和柱子优先使用 GPU。 */

import {
  createProjectionRevision,
  sameProjectionRevision,
} from '@/engine/frame/impl/retainedProjection.js'
import type { ProjectionRevision } from '@/engine/frame/types.js'
import { createIndicatorRendererLayer } from '@/engine/renderers/Indicator/shared/indicatorRendererLayer.js'
import { tryDrawLinesGpu } from '@/engine/renderers/linesViaRenderer.js'
import { drawWorldRectBatches } from '@/engine/renderers/rectsViaRenderer.js'
import { logicalIndexToScreenX } from '@/engine/viewport/logicalIndexToScreenX.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { createRetainedGeometry } from '@/rendering/scene/retainedGeometry.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { Plot, PlotFill, PlotRenderState } from '../types.js'
import { buildShapeGlyph, paintShapeGlyph, type ShapeGlyph } from './shapeGeometry.js'

type Point = { x: number; y: number }
type LineBatch = { points: Point[]; width: number; color: string }
type RectBatch = { color: string; buf: Float64Array; count: number }
interface PlotGeometry {
  readonly points: ReadonlyMap<Plot, ReadonlyMap<number, Point>>
  readonly lines: ReadonlyMap<Plot, LineBatch[]>
  readonly histograms: ReadonlyMap<Plot, RectBatch[]>
  readonly shapes: ReadonlyMap<Plot, ShapeGlyph>
}

const SHAPE_BAR_GAP = 4

/** 按 Shape 的定位语义求屏幕锚点；bar 定位使用偏移后的目标 K 线。 */
function shapeY(
  plot: Extract<Plot, { kind: 'shape' }>,
  value: number,
  index: number,
  glyph: ShapeGlyph,
  context: RenderContext,
): number | undefined {
  if (plot.location !== 'absolute' && value === 0) return undefined
  const axis = context.pane.yAxis
  switch (plot.location) {
    case 'absolute':
      return axis.priceToY(value)
    case 'top':
      return axis.getPaddingTop() + SHAPE_BAR_GAP - glyph.top
    case 'bottom':
      return context.pane.height - axis.getPaddingBottom() - SHAPE_BAR_GAP - glyph.bottom
    case 'abovebar': {
      const bar = context.data[index]
      return bar
        ? axis.priceToY('close' in bar ? bar.high : bar.price) - SHAPE_BAR_GAP - glyph.bottom
        : undefined
    }
    case 'belowbar': {
      const bar = context.data[index]
      return bar
        ? axis.priceToY('close' in bar ? bar.low : bar.price) + SHAPE_BAR_GAP - glyph.top
        : undefined
    }
  }
}

/** 取一个 Plot 在指定显示位置的点，空值保持断开。 */
function projectPoint(
  plot: Plot,
  index: number,
  context: RenderContext,
  glyph?: ShapeGlyph,
): Point | undefined {
  const value = plot.data[index - plot.offset]?.value
  if (value === undefined || !Number.isFinite(value)) return undefined
  const screenX = logicalIndexToScreenX({
    index,
    visibleRange: {
      start: context.range.start,
      end: context.range.start + context.kLineCenters.length,
    },
    centers: context.kLineCenters,
    scrollLeft: 0,
    dpr: context.dpr,
    fallbackStep: context.kWidth + context.kGap,
  })
  if (screenX === null) return undefined
  const y =
    plot.kind === 'shape'
      ? glyph && shapeY(plot, value, index, glyph, context)
      : context.pane.yAxis.priceToY(value)
  return y !== undefined && Number.isFinite(y) ? { x: screenX, y } : undefined
}

/** 仅遍历当前视口与超出行情长度的未来序列，不扫描中间的不可见历史。 */
function* plotIndices(plot: Plot, context: RenderContext): Iterable<number> {
  for (let index = context.range.start; index < context.range.end; index++) yield index
  for (
    let index = Math.max(context.range.end, context.data.length);
    index < plot.data.length + plot.offset;
    index++
  )
    yield index
}

/** 一个轴版本只投影一次，滚动重放复用世界坐标。 */
function collectGeometry(state: PlotRenderState, context: RenderContext): PlotGeometry {
  const geometry = new Map<Plot, Map<number, Point>>()
  const lines = new Map<Plot, LineBatch[]>()
  const histograms = new Map<Plot, RectBatch[]>()
  const shapes = new Map<Plot, ShapeGlyph>()
  for (const plot of state.plots) {
    const glyph = plot.kind === 'shape' ? buildShapeGlyph(plot, context) : undefined
    if (glyph) shapes.set(plot, glyph)
    const points = new Map<number, Point>()
    for (const index of plotIndices(plot, context)) {
      const point = projectPoint(plot, index, context, glyph)
      if (point) points.set(index, point)
    }
    geometry.set(plot, points)
    if (plot.kind === 'line') lines.set(plot, buildLineSegments(plot, context, points))
    if (plot.kind === 'histogram') histograms.set(plot, buildHistogram(plot, context, points))
  }
  return { points: geometry, lines, histograms, shapes }
}

/** Shape 与其他 Plot 共用投影缓存和滚动坐标，不额外创建标记 Layer。 */
function drawShapes(
  plot: Extract<Plot, { kind: 'shape' }>,
  context: RenderContext,
  geometry: PlotGeometry,
): void {
  const glyph = geometry.shapes.get(plot)
  if (!glyph) return
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.setLineDash([])
  for (const [index, point] of geometry.points.get(plot) ?? []) {
    const data = plot.data[index - plot.offset]
    paintShapeGlyph(
      ctx,
      glyph,
      point.x,
      point.y,
      data?.color ?? plot.color,
      data?.textColor ?? plot.textColor,
    )
  }
  ctx.restore()
}

/** 构建可复用的折线批次；遇到空点或颜色变化时开始新段。 */
function buildLineSegments(
  plot: Extract<Plot, { kind: 'line' }>,
  context: RenderContext,
  points: ReadonlyMap<number, Point>,
): LineBatch[] {
  const lines: LineBatch[] = []
  let segment: Point[] = []
  let color = plot.color
  let previous: Point | undefined
  let previousIndex = context.range.start - 1
  for (const index of plotIndices(plot, context)) {
    if (index !== previousIndex + 1) {
      segment = []
      previous = undefined
    }
    previousIndex = index
    const point = points.get(index)
    if (!point) {
      segment = []
      previous = undefined
      continue
    }
    const nextColor = plot.data[index - plot.offset]?.color ?? plot.color
    if (segment.length === 0 || nextColor !== color) {
      segment = previous ? [previous] : []
      color = nextColor
      lines.push({ points: segment, width: plot.width, color })
    }
    segment.push(point)
    previous = point
  }
  return lines.filter((line) => line.points.length >= 2)
}

/** 重放折线批次，保留稳定点数组供 GPU 几何缓存复用。 */
function drawLine(
  plot: Extract<Plot, { kind: 'line' }>,
  context: RenderContext,
  geometry: PlotGeometry,
): void {
  const drawable = geometry.lines.get(plot) ?? []
  if (plot.dash.length === 0 && tryDrawLinesGpu(context, drawable, context.scrollLeft)) return
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.lineWidth = plot.width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([...plot.dash])
  for (const line of drawable) {
    const first = line.points[0]
    if (!first) continue
    ctx.strokeStyle = line.color
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    for (let index = 1; index < line.points.length; index++) {
      const point = line.points[index]
      if (point) ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** 构建柱状几何，横向宽度沿用图表的 K 线几何。 */
function buildHistogram(
  plot: Extract<Plot, { kind: 'histogram' }>,
  context: RenderContext,
  points: ReadonlyMap<number, Point>,
): RectBatch[] {
  const batches = new Map<string, RectBatch>()
  const baselineY = context.pane.yAxis.priceToY(plot.baseline)
  if (!Number.isFinite(baselineY)) return []
  for (let index = context.range.start; index < context.range.end; index++) {
    const point = points.get(index)
    const bar = context.kBarRects[index - context.range.start]
    if (!point || !bar || bar.width <= 0) continue
    const color = plot.data[index - plot.offset]?.color ?? plot.color
    let batch = batches.get(color)
    if (!batch) {
      batch = {
        color,
        buf: new Float64Array((context.range.end - context.range.start) * 4),
        count: 0,
      }
      batches.set(color, batch)
    }
    const offset = batch.count++ * 4
    batch.buf[offset] = bar.x
    batch.buf[offset + 1] = Math.min(point.y, baselineY)
    batch.buf[offset + 2] = bar.width
    batch.buf[offset + 3] = Math.max(1 / context.dpr, Math.abs(point.y - baselineY))
  }
  return [...batches.values()]
}

/** 画独立散点，不连接相邻数据。 */
function drawPoints(
  plot: Extract<Plot, { kind: 'points' }>,
  context: RenderContext,
  geometry: PlotGeometry,
): void {
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  for (const index of plotIndices(plot, context)) {
    const point = geometry.points.get(plot)?.get(index)
    if (!point) continue
    ctx.fillStyle = plot.data[index - plot.offset]?.color ?? plot.color
    ctx.beginPath()
    ctx.arc(point.x, point.y, plot.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 填充两个序列之间的区域；相交时在交点切换颜色。 */
function drawFill(
  fill: PlotFill,
  plots: readonly Plot[],
  context: RenderContext,
  geometry: PlotGeometry,
): void {
  const from = plots.find((plot) => plot.id === fill.from)
  const to = plots.find((plot) => plot.id === fill.to)
  if (!from || !to) throw new TypeError(`Unknown Plot fill source: ${fill.id}`)
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.globalAlpha = fill.opacity
  const paint = (a: Point, b: Point, c: Point, d: Point, reverse: boolean) => {
    ctx.fillStyle = reverse ? fill.reverseColor : fill.color
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(d.x, d.y)
    ctx.closePath()
    ctx.fill()
  }
  for (const index of plotIndices(from, context)) {
    const a = geometry.points.get(from)?.get(index - 1),
      b = geometry.points.get(from)?.get(index)
    const c = geometry.points.get(to)?.get(index),
      d = geometry.points.get(to)?.get(index - 1)
    if (!a || !b || !c || !d) continue
    const left = a.y - d.y,
      right = b.y - c.y
    if (left * right < 0) {
      const t = left / (left - right)
      const cross = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      paint(a, cross, cross, d, left > 0)
      paint(cross, b, c, cross, right > 0)
    } else paint(a, b, c, d, left + right > 0)
  }
  ctx.restore()
}

/** 绘制一个指标实例的全部 Plot、填充和参考线。 */
export function paintPlots(
  state: PlotRenderState,
  context: RenderContext,
  geometry: PlotGeometry = collectGeometry(state, context),
): void {
  for (const fill of state.fills) if (fill.visible) drawFill(fill, state.plots, context, geometry)
  const { ctx } = context
  ctx.save()
  ctx.lineWidth = 1
  for (const guide of state.guides) {
    const y = context.pane.yAxis.priceToY(guide.value)
    if (!Number.isFinite(y)) continue
    ctx.strokeStyle = guide.color
    ctx.setLineDash([...guide.dash])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(context.paneWidth, y)
    ctx.stroke()
  }
  ctx.restore()
  for (const plot of state.plots) {
    if (!plot.visible) continue
    switch (plot.kind) {
      case 'line':
        drawLine(plot, context, geometry)
        break
      case 'histogram':
        drawWorldRectBatches(context, geometry.histograms.get(plot) ?? [])
        break
      case 'points':
        drawPoints(plot, context, geometry)
        break
      case 'shape':
        drawShapes(plot, context, geometry)
        break
    }
  }
}

/** 所有普通指标共用同一 Layer 工厂，实例只提供 Plot 数据。 */
export function createPlotLayer(
  definitionId: string,
  defaultPaneId: string,
  options: { paneId?: string; instanceId?: string } = {},
): Layer<RenderContext> {
  const retained = createRetainedGeometry<PlotGeometry, ProjectionRevision>(sameProjectionRevision)
  return createIndicatorRendererLayer({
    definitionId,
    paneId: options.paneId ?? defaultPaneId,
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
      if (!options.instanceId) return
      const state = context.indicatorStateReader?.get<PlotRenderState>(options.instanceId)
      if (state?.kind !== 'plots') return
      const geometry = retained.read(
        createProjectionRevision(context, [state.plots, context.data, context.theme]),
        () => collectGeometry(state, context),
      )
      paintPlots(state, context, geometry)
    },
    dispose: () => retained.clear(),
  })
}
