/** 通用 Plot Layer：按绘图类型投影到 Pane 坐标，线条和柱子优先使用 GPU。 */

import type {
  HistogramPlot,
  LinePlot,
  Plot,
  PlotFill,
  PointsPlot,
  ShapePlot,
} from '@363045841yyt/klinechart-plot-contracts'
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
import type { PlotRenderState } from '../types.js'
import { buildShapeGlyph, paintShapeGlyph, type ShapeGlyph } from './shapeGeometry.js'

type Point = { x: number; y: number }
type LineBatch = { points: Point[]; width: number; color: string }
type RectBatch = { color: string; buf: Float64Array; count: number }

/** 折线的投影结果：批次供 GPU 或 Canvas2D 重放。 */
interface LineProjection {
  readonly kind: 'line'
  readonly plot: LinePlot
  readonly points: ReadonlyMap<number, Point>
  readonly lines: readonly LineBatch[]
}

/** 柱状图的投影结果。 */
interface HistogramProjection {
  readonly kind: 'histogram'
  readonly plot: HistogramPlot
  readonly points: ReadonlyMap<number, Point>
  readonly rects: readonly RectBatch[]
}

/** 散点的投影结果。 */
interface PointsProjection {
  readonly kind: 'points'
  readonly plot: PointsPlot
  readonly points: ReadonlyMap<number, Point>
}

/** Shape 的投影结果：字形只测量一次，随滚动重放。 */
interface ShapeProjection {
  readonly kind: 'shape'
  readonly plot: ShapePlot
  readonly points: ReadonlyMap<number, Point>
  readonly glyph: ShapeGlyph
}

/** 一个 Plot 的完整投影；每种 kind 携带自己的重放数据，绘制端不再判空或回查。 */
type PlotProjection = LineProjection | HistogramProjection | PointsProjection | ShapeProjection

/** 填充的投影结果：端点在此解析，重放时不再按 id 查找。 */
interface FillProjection {
  readonly fill: PlotFill
  readonly from: PlotProjection
  readonly to: PlotProjection
}

/** 一帧可复用的全部重放数据。 */
interface PlotGeometry {
  readonly plots: readonly PlotProjection[]
  readonly fills: readonly FillProjection[]
}

const SHAPE_BAR_GAP = 4

/** 按 Shape 的定位语义求屏幕锚点；相对定位只用 K 线位置，absolute 用价格。 */
function shapeY(
  plot: ShapePlot,
  value: number,
  index: number,
  glyph: ShapeGlyph,
  context: RenderContext,
): number | undefined {
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

/** 该 bar 的有限数值；缺省与 NaN 都表示不绘制，0 是合法取值。 */
function barValue(plot: Plot, index: number): number | undefined {
  const value = plot.data[index - plot.offset]?.value
  return value === undefined || !Number.isFinite(value) ? undefined : value
}

/** 把 K 线下标投影到屏幕 X；该下标不在绘图区时返回 null。 */
function projectX(index: number, context: RenderContext): number | null {
  return logicalIndexToScreenX({
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
}

/** 投影价格定位的 Plot 点；空值保持断开。 */
function projectPricePoint(
  plot: LinePlot | HistogramPlot | PointsPlot,
  index: number,
  context: RenderContext,
): Point | undefined {
  const value = barValue(plot, index)
  if (value === undefined) return undefined
  const x = projectX(index, context)
  if (x === null) return undefined
  const y = context.pane.yAxis.priceToY(value)
  return Number.isFinite(y) ? { x, y } : undefined
}

/** 投影一个 Shape 的锚点；值只用来判定有无信号，absolute 除外。 */
function projectShapePoint(
  plot: ShapePlot,
  value: number,
  index: number,
  context: RenderContext,
  glyph: ShapeGlyph,
): Point | undefined {
  const x = projectX(index, context)
  if (x === null) return undefined
  const y = shapeY(plot, value, index, glyph, context)
  return y !== undefined && Number.isFinite(y) ? { x, y } : undefined
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

/** 逐 bar 投影并收集有点位的下标。 */
function projectPoints(
  plot: Plot,
  context: RenderContext,
  project: (index: number) => Point | undefined,
): Map<number, Point> {
  const points = new Map<number, Point>()
  for (const index of plotIndices(plot, context)) {
    const point = project(index)
    if (point) points.set(index, point)
  }
  return points
}

/** 构建可复用的折线批次；遇到空点或颜色变化时开始新段。 */
function buildLineSegments(
  plot: LinePlot,
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

/** 构建柱状几何，横向宽度沿用图表的 K 线几何。 */
function buildHistogram(
  plot: HistogramPlot,
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

/** 投影单个 Plot；每种 kind 只构建自己绘制所需的数据。 */
function projectPlot(plot: Plot, context: RenderContext): PlotProjection {
  switch (plot.kind) {
    case 'line': {
      const points = projectPoints(plot, context, (index) =>
        projectPricePoint(plot, index, context),
      )
      return { kind: 'line', plot, points, lines: buildLineSegments(plot, context, points) }
    }
    case 'histogram': {
      const points = projectPoints(plot, context, (index) =>
        projectPricePoint(plot, index, context),
      )
      return { kind: 'histogram', plot, points, rects: buildHistogram(plot, context, points) }
    }
    case 'points': {
      const points = projectPoints(plot, context, (index) =>
        projectPricePoint(plot, index, context),
      )
      return { kind: 'points', plot, points }
    }
    case 'shape': {
      const glyph = buildShapeGlyph(plot, context)
      const points = projectPoints(plot, context, (index) => {
        const value = barValue(plot, index)
        return value === undefined
          ? undefined
          : projectShapePoint(plot, value, index, context, glyph)
      })
      return { kind: 'shape', plot, points, glyph }
    }
  }
}

/** 解析填充端点；id 引用已由 validatePlotFills 校验，缺失即契约违规。 */
function resolveFill(fill: PlotFill, byId: ReadonlyMap<string, PlotProjection>): FillProjection {
  const from = byId.get(fill.from)
  const to = byId.get(fill.to)
  if (!from || !to) throw new TypeError(`Unknown Plot fill source: ${fill.id}`)
  return { fill, from, to }
}

/** 一次投影构建全部重放数据，滚动重放不重新投影也不重新查找。 */
function collectGeometry(state: PlotRenderState, context: RenderContext): PlotGeometry {
  const plots = state.plots.map((plot) => projectPlot(plot, context))
  const byId = new Map(plots.map((projection) => [projection.plot.id, projection]))
  return { plots, fills: state.fills.map((fill) => resolveFill(fill, byId)) }
}

/** Shape 与其他 Plot 共用投影缓存和滚动坐标，不额外创建标记 Layer。 */
function drawShapes(projection: ShapeProjection, context: RenderContext): void {
  const { plot, glyph, points } = projection
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.setLineDash([])
  for (const [index, point] of points) {
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

/** 重放折线批次，保留稳定点数组供 GPU 几何缓存复用。 */
function drawLine(projection: LineProjection, context: RenderContext): void {
  const { plot, lines } = projection
  if (plot.dash.length === 0 && tryDrawLinesGpu(context, lines, context.scrollLeft)) return
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.lineWidth = plot.width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([...plot.dash])
  for (const line of lines) {
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

/** 画独立散点，不连接相邻数据。 */
function drawPoints(projection: PointsProjection, context: RenderContext): void {
  const { plot, points } = projection
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  for (const [index, point] of points) {
    ctx.fillStyle = plot.data[index - plot.offset]?.color ?? plot.color
    ctx.beginPath()
    ctx.arc(point.x, point.y, plot.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 填充两个序列之间的区域；相交时在交点切换颜色。 */
function drawFill(projection: FillProjection, context: RenderContext): void {
  const { fill, from, to } = projection
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.globalAlpha = fill.opacity
  const paint = (a: Point, b: Point, c: Point, d: Point, reverse: boolean): void => {
    ctx.fillStyle = reverse ? fill.reverseColor : fill.color
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(d.x, d.y)
    ctx.closePath()
    ctx.fill()
  }
  for (const index of plotIndices(from.plot, context)) {
    const a = from.points.get(index - 1),
      b = from.points.get(index)
    const c = to.points.get(index),
      d = to.points.get(index - 1)
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

/** 绘制一个指标实例的全部填充、参考线和 Plot。 */
export function paintPlots(
  state: PlotRenderState,
  context: RenderContext,
  geometry: PlotGeometry = collectGeometry(state, context),
): void {
  for (const fill of geometry.fills) if (fill.fill.visible) drawFill(fill, context)
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
  for (const projection of geometry.plots) {
    if (!projection.plot.visible) continue
    switch (projection.kind) {
      case 'line':
        drawLine(projection, context)
        break
      case 'histogram':
        drawWorldRectBatches(context, projection.rects)
        break
      case 'points':
        drawPoints(projection, context)
        break
      case 'shape':
        drawShapes(projection, context)
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
