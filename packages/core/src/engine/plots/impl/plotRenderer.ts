/** 通用 Plot Layer：按绘图类型投影到 Pane 坐标，线条和柱子优先使用 GPU。 */

import type {
  ArrowPlot,
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
import { barVerticalRect } from '@/engine/renderers/barGeometry/impl/projectBars.js'
import { createIndicatorRendererLayer } from '@/engine/renderers/Indicator/shared/indicatorRendererLayer.js'
import { tryDrawLinesGpu } from '@/engine/renderers/linesViaRenderer.js'
import { drawWorldRectBatches } from '@/engine/renderers/rectsViaRenderer.js'
import { logicalIndexToScreenX } from '@/engine/viewport/logicalIndexToScreenX.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { createRetainedGeometry } from '@/rendering/scene/retainedGeometry.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { PlotRenderState } from '../types.js'
import {
  buildArrowGlyph,
  buildMarkerGlyph,
  type MarkerGlyph,
  paintMarkerGlyph,
} from './markerGeometry.js'
import {
  arrowMaxHeight,
  arrowMinHeight,
  barWidthRatio,
  lineWidth,
  pointRadius,
} from './plotSize.js'

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

/** 标记的单点投影，字形与颜色随滚动直接重放。 */
interface MarkerPoint extends Point {
  readonly glyph: MarkerGlyph
  readonly color: string
  readonly textColor: string
}

/** Shape、Char、Arrow 共用同一投影和重放数据。 */
interface MarkerProjection {
  readonly kind: 'shape' | 'char' | 'arrow'
  readonly plot: Extract<Plot, { kind: 'shape' | 'char' | 'arrow' }>
  readonly points: ReadonlyMap<number, MarkerPoint>
}

/** 一个 Plot 的完整投影；每种 kind 携带自己的重放数据，绘制端不再判空或回查。 */
type PlotProjection = LineProjection | HistogramProjection | PointsProjection | MarkerProjection

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

const MARKER_BAR_GAP = 4

/** 相对定位锚定的 bar 极值；时间轴数据没有 OHLC，只有 price。 */
function barAnchorPrice(bar: RenderContext['data'][number], above: boolean): number {
  if (!('close' in bar)) return bar.price
  return above ? bar.high : bar.low
}

/** abovebar/belowbar：锚在偏移后的 K 线极值上，再让字形避开 K 线。 */
function barMarkerY(
  above: boolean,
  index: number,
  glyph: MarkerGlyph,
  context: RenderContext,
): number | undefined {
  const bar = context.data[index]
  if (!bar) return undefined
  const anchor = context.pane.yAxis.priceToY(barAnchorPrice(bar, above))
  return above ? anchor - MARKER_BAR_GAP - glyph.bottom : anchor + MARKER_BAR_GAP - glyph.top
}

/** 按共享标记位置求屏幕锚点；相对定位用 K 线位置，absolute 用价格。 */
function markerY(
  location: ShapePlot['location'],
  value: number,
  index: number,
  glyph: MarkerGlyph,
  context: RenderContext,
): number | undefined {
  const axis = context.pane.yAxis
  switch (location) {
    case 'absolute':
      return axis.priceToY(value)
    case 'top':
      return axis.getPaddingTop() + MARKER_BAR_GAP - glyph.top
    case 'bottom':
      return context.pane.height - axis.getPaddingBottom() - MARKER_BAR_GAP - glyph.bottom
    case 'abovebar':
      return barMarkerY(true, index, glyph, context)
    case 'belowbar':
      return barMarkerY(false, index, glyph, context)
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

/** 投影共享标记锚点；相对位置使用 bar，absolute 使用输入坐标。 */
function projectMarkerPoint(
  location: ShapePlot['location'],
  value: number,
  index: number,
  context: RenderContext,
  glyph: MarkerGlyph,
): Point | undefined {
  const x = projectX(index, context)
  if (x === null) return undefined
  const y = markerY(location, value, index, glyph, context)
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
      lines.push({ points: segment, width: lineWidth(plot.size), color })
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
    // 先对齐数值端点和基线，再求高度，保证所有柱子的基线边缘一致。
    const vertical = barVerticalRect(point.y, baselineY, context.dpr)
    // 柱宽按 size 档位相对 K 线间距缩放，缩放后仍与 K 线中心对齐。
    const width = bar.width * barWidthRatio(plot.size)
    const offset = batch.count++ * 4
    batch.buf[offset] = bar.x + (bar.width - width) / 2
    batch.buf[offset + 1] = vertical.y
    batch.buf[offset + 2] = width
    batch.buf[offset + 3] = vertical.height
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
    case 'shape':
    case 'char':
    case 'arrow':
      return projectMarkers(plot, context)
  }
}

/** 全列统计箭头幅度，屏幕缩放与可见范围不改变长度。 */
function arrowMagnitude(plot: Plot): number {
  let maximum = 0
  for (const point of plot.data) {
    if (point && Number.isFinite(point.value)) maximum = Math.max(maximum, Math.abs(point.value))
  }
  return maximum
}

/** 方向或声明位置：箭头按正负贴到 K 线下方或上方，其余用声明位置。 */
function markerLocation(plot: MarkerProjection['plot'], value: number): ShapePlot['location'] {
  if (plot.kind !== 'arrow') return plot.location
  return value > 0 ? 'belowbar' : 'abovebar'
}

/** 逐 bar 颜色优先于整列样式。 */
function overrideColor(color: string | undefined, fallback: string): string {
  return color ?? fallback
}

/** 统一构建标记；相对定位过滤 0，绝对坐标保留 0。 */
function projectMarkers(plot: MarkerProjection['plot'], context: RenderContext): MarkerProjection {
  const points = new Map<number, MarkerPoint>()
  const appearance = markerAppearance(plot, context)
  for (const index of plotIndices(plot, context)) {
    const value = barValue(plot, index)
    if (value === undefined) continue
    const location = markerLocation(plot, value)
    if (location !== 'absolute' && value === 0) continue
    const style = appearance(value)
    const point = projectMarkerPoint(location, value, index, context, style.glyph)
    if (!point) continue
    const data = plot.data[index - plot.offset]
    points.set(index, {
      ...point,
      ...style,
      color: overrideColor(data?.color, style.color),
      textColor: overrideColor(data?.textColor, style.textColor),
    })
  }
  return { kind: plot.kind, plot, points }
}

/** 箭头高度：按全列最大幅度归一化，再夹在 size 决定的高度范围内。 */
function arrowHeight(plot: ArrowPlot, value: number, maximum: number): number {
  const maxHeight = arrowMaxHeight(plot.size)
  return Math.max(
    arrowMinHeight(plot.size),
    Math.min(maxHeight, maxHeight * (Math.abs(value) / maximum)),
  )
}

/** 固定字形只测量一次，箭头按全列幅度生成每个点的字形。 */
function markerAppearance(
  plot: MarkerProjection['plot'],
  context: RenderContext,
): (value: number) => Pick<MarkerPoint, 'glyph' | 'color' | 'textColor'> {
  if (plot.kind === 'arrow') {
    const maximum = arrowMagnitude(plot)
    return (value) => {
      const color = value > 0 ? plot.colorUp : plot.colorDown
      return {
        glyph: buildArrowGlyph(arrowHeight(plot, value, maximum), value > 0, context),
        color,
        textColor: color,
      }
    }
  }
  const style = {
    glyph: buildMarkerGlyph(plot, context),
    color: plot.color,
    textColor: plot.textColor,
  }
  return () => style
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

/** 三个标记 kind 共用 Plot 的缓存与滚动坐标，不额外创建 Layer。 */
function drawMarkers(projection: MarkerProjection, context: RenderContext): void {
  const { points } = projection
  const { ctx } = context
  ctx.save()
  ctx.translate(-context.scrollLeft, 0)
  ctx.setLineDash([])
  for (const point of points.values()) {
    paintMarkerGlyph(ctx, point.glyph, point.x, point.y, point.color, point.textColor)
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
  ctx.lineWidth = lineWidth(plot.size)
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
    ctx.arc(point.x, point.y, pointRadius(plot.size), 0, Math.PI * 2)
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
      case 'char':
      case 'arrow':
        drawMarkers(projection, context)
        break
    }
  }
}

/** 所有普通指标共用同一 Layer 工厂，实例只提供 Plot 数据。 */
export function createPlotLayer(
  definitionId: string,
  defaultPaneId: string,
  options: { instanceId: string },
): Layer<RenderContext> {
  const retained = createRetainedGeometry<PlotGeometry, ProjectionRevision>(sameProjectionRevision)
  return createIndicatorRendererLayer({
    definitionId,
    paneId: defaultPaneId,
    z: RENDERER_PRIORITY.INDICATOR,
    draw(context) {
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
