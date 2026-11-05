/** 通用 Plot Layer：保留投影缓存，所有绘制按顺序提交公共屏幕原语。 */

import type {
  ArrowPlot,
  ColumnsPlot,
  HistogramPlot,
  LineBRPlot,
  LinePlot,
  OhlcPlot,
  Plot,
  PlotFill,
  PointsPlot,
  ScalarPlot,
  ShapePlot,
  StepLineBRPlot,
  StepLinePlot,
} from '@363045841yyt/klinechart-plot-contracts'
import { ohlcPlotStart } from '@363045841yyt/klinechart-plot-contracts'
import {
  createProjectionRevision,
  sameProjectionRevision,
} from '@/engine/frame/impl/retainedProjection.js'
import type { ProjectionRevision } from '@/engine/frame/types.js'
import { projectBarPrimitives } from '@/engine/renderers/barGeometry/impl/paintBars.js'
import { barVerticalRect } from '@/engine/renderers/barGeometry/impl/projectBars.js'
import { createIndicatorRendererLayer } from '@/engine/renderers/Indicator/shared/indicatorRendererLayer.js'
import { projectOhlc } from '@/engine/renderers/ohlcGeometry/impl/projectOhlc.js'
import type { OhlcGeometryInput, OhlcRect } from '@/engine/renderers/ohlcGeometry/types.js'
import { calcBarLeftPx } from '@/engine/viewport/klineConfig.js'
import { createKLineSlotGrid, slotWorldX } from '@/engine/viewport/slotGrid.js'
import type { PrimitiveRenderContext, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import { worldXToScreenX } from '@/foundation/utils/pixelAlign.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive, PrimitivePath } from '@/rendering/primitives/types.js'
import { createRetainedGeometry } from '@/rendering/scene/retainedGeometry.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { PlotRenderState } from '../types.js'
import { projectColumnPrimitives } from './columnGeometry.js'
import { buildFillBands, type FillBand } from './fillGeometry.js'
import {
  buildArrowGlyph,
  buildMarkerGlyph,
  type MarkerGlyph,
  markerPrimitives,
} from './markerGeometry.js'
import {
  arrowMaxHeight,
  arrowMinHeight,
  histogramWidth,
  lineWidth,
  pointRadius,
} from './plotSize.js'

type Point = { x: number; y: number }
type LineBatch = { points: Point[]; width: number; color: string }
type RectBatch = { color: string; buf: Float64Array; count: number }
type LineSeriesPlot = LinePlot | LineBRPlot | StepLinePlot | StepLineBRPlot

/** 折线的投影结果：批次供 GPU 或 Canvas2D 重放。 */
interface LineProjection {
  readonly kind: 'line'
  readonly plot: LineSeriesPlot
  readonly points: ReadonlyMap<number, Point>
  readonly lines: readonly LineBatch[]
}

/** Columns 只保留数据点，屏幕槽界在每次滚动重放时生成。 */
interface ColumnProjection {
  readonly kind: 'columns'
  readonly plot: ColumnsPlot
  readonly points: ReadonlyMap<number, Point>
}

/** Histogram 使用固定像素宽度的世界矩形。 */
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
type PlotProjection =
  | LineProjection
  | ColumnProjection
  | HistogramProjection
  | PointsProjection
  | MarkerProjection
  | OhlcProjection

/** OHLC 的绘制批次；没有可供 fill 引用的单值边界。 */
interface OhlcProjection {
  readonly kind: 'candle' | 'bar'
  readonly plot: OhlcPlot
  readonly points: ReadonlyMap<number, Point>
  readonly rects: readonly RectBatch[]
}

/** 填充的投影结果：端点在此解析，重放时不再按 id 查找。 */
interface FillProjection {
  readonly fill: PlotFill
  readonly bands: readonly FillBand[]
}

/** 一帧可复用的全部重放数据。 */
interface PlotGeometry {
  readonly plots: readonly PlotProjection[]
  readonly fills: readonly FillProjection[]
}

const MARKER_BAR_GAP = 4

/** 未被填充引用的线不保留点表，统一复用一个空表。 */
const EMPTY_POINTS: ReadonlyMap<number, Point> = new Map()

/** 相对定位锚定的 bar 极值；时间轴数据没有 OHLC，只有 price。 */
function barAnchorPrice(bar: PrimitiveRenderContext['data'][number], above: boolean): number {
  if (!('close' in bar)) return bar.price
  return above ? bar.high : bar.low
}

/** abovebar/belowbar：锚在偏移后的 K 线极值上，再让字形避开 K 线。 */
function barMarkerY(
  above: boolean,
  index: number,
  glyph: MarkerGlyph,
  context: PrimitiveRenderContext,
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
  context: PrimitiveRenderContext,
): number | undefined {
  const axis = context.pane.yAxis
  switch (location) {
    case 'absolute':
      return axis.priceToY(value)
    case 'top':
      return axis.getContentTop() + MARKER_BAR_GAP - glyph.top
    case 'bottom':
      return axis.getContentBottom() - MARKER_BAR_GAP - glyph.bottom
    case 'abovebar':
      return barMarkerY(true, index, glyph, context)
    case 'belowbar':
      return barMarkerY(false, index, glyph, context)
  }
}

/** 该 bar 的有限数值；缺省与 NaN 都表示不绘制，0 是合法取值。 */
function barValue(plot: ScalarPlot, index: number): number | undefined {
  const value = plot.data[index - plot.offset]?.value
  return value === undefined || !Number.isFinite(value) ? undefined : value
}

/** 把 K 线下标投影到屏幕 X；内联查表并预计算外推步长，避免每个点分配参数对象。 */
function projectX(index: number, context: PrimitiveRenderContext): number | null {
  const centers = context.kLineCenters
  if (!Number.isFinite(index) || centers.length === 0) return null
  const center = centers[index - context.range.start]
  if (Number.isFinite(center)) return center!
  // 显示中心量化后不再等距，视口外与小数索引必须从理想网格独立采样。
  if (context.dataView === ChartDataViewId.KLine) return projectKLineGridX(index, context)
  return interpolateCenter(centers, index - context.range.start, context)
}

/** K 线视图从连续槽位网格取 X，避免用量化后的相邻中心反推槽距。 */
function projectKLineGridX(index: number, context: PrimitiveRenderContext): number {
  const grid = createKLineSlotGrid(context.kWidth, context.kGap, context.dpr)
  return (
    worldXToScreenX(slotWorldX(grid, index), context.scrollLeft, context.dpr) + context.scrollLeft
  )
}

/** 可见范围外的索引按首/末中心与槽位步长线性外推。 */
function interpolateCenter(
  centers: readonly number[],
  offset: number,
  context: PrimitiveRenderContext,
): number | null {
  const lower = Math.floor(offset)
  if (lower >= 0 && lower + 1 < centers.length) {
    const left = centers[lower]!
    const right = centers[lower + 1]!
    return left + (right - left) * (offset - lower)
  }
  const step =
    centers.length >= 2
      ? offset < 0
        ? centers[1]! - centers[0]!
        : centers[centers.length - 1]! - centers[centers.length - 2]!
      : context.kWidth + context.kGap
  if (!Number.isFinite(step) || step === 0) return null
  const originCenter = offset < 0 ? centers[0]! : centers[centers.length - 1]!
  return originCenter + (offset - (offset < 0 ? 0 : centers.length - 1)) * step
}

/** 投影价格定位的 Plot 点；空值保持断开。 */
function projectPricePoint(
  plot: LineSeriesPlot | HistogramPlot | ColumnsPlot | PointsPlot,
  index: number,
  context: PrimitiveRenderContext,
): Point | undefined {
  const value = barValue(plot, index)
  if (value === undefined) return undefined
  const x = plot.kind === 'columns' ? slotWorldX(context.slotGrid, index) : projectX(index, context)
  if (x === null) return undefined
  const y = context.pane.yAxis.priceToY(value)
  return Number.isFinite(y) ? { x, y } : undefined
}

/** 投影共享标记锚点；相对位置使用 bar，absolute 使用输入坐标。 */
function projectMarkerPoint(
  location: ShapePlot['location'],
  value: number,
  index: number,
  context: PrimitiveRenderContext,
  glyph: MarkerGlyph,
): Point | undefined {
  const x = projectX(index, context)
  if (x === null) return undefined
  const y = markerY(location, value, index, glyph, context)
  return y !== undefined && Number.isFinite(y) ? { x, y } : undefined
}

/** 只遍历视口附近的点，不扫描中间的不可见历史；margin 由需要缓存的折线单独开启。 */
function* plotIndices(plot: Plot, context: PrimitiveRenderContext, margin = 0): Iterable<number> {
  // 折线左右各留半屏：纯滚动时点集不变，几何缓存才能命中，避免每帧重新三角化。
  for (
    let index = Math.max(0, context.range.start - margin);
    index < context.range.end + margin;
    index++
  )
    yield index
  for (
    let index = Math.max(context.range.end, context.data.length);
    index < plot.data.length + plot.offset;
    index++
  )
    yield index
}

/** 折线的投影边距：半屏，足够覆盖纯滚动而不会把整段历史重新三角化。 */
function lineMargin(context: PrimitiveRenderContext): number {
  return Math.max(2, Math.ceil(context.kLineCenters.length / 2))
}

/** 逐 bar 投影并收集有点位的下标。 */
function projectPoints(
  plot: Plot,
  context: PrimitiveRenderContext,
  project: (index: number) => Point | undefined,
  margin = 0,
): Map<number, Point> {
  const points = new Map<number, Point>()
  for (const index of plotIndices(plot, context, margin)) {
    const point = project(index)
    if (point) points.set(index, point)
  }
  return points
}

/** 判断 Plot 是否采用中点跳变的阶梯形状，供路径与填充共同使用。 */
function isStepPlot(plot: Plot): boolean {
  return plot.kind === 'stepline' || plot.kind === 'steplinebr'
}

/** 折线构建过程中的可变段状态。 */
interface LineSegmentState {
  segment: Point[]
  color: string
  previous: Point | undefined
  previousIndex: number
  lines: LineBatch[]
}

/** 断点或颜色变化时重新开始一段，并继承前一有效端点。 */
function startLineSegment(state: LineSegmentState, plot: LineSeriesPlot, color: string): void {
  state.segment = state.previous ? [state.previous] : []
  state.color = color
  state.lines.push({ points: state.segment, width: lineWidth(plot.size), color })
}

/** 把单个点追加到当前段；阶梯线在 y 变化处插入中点跳变。 */
function appendLinePoint(
  state: LineSegmentState,
  index: number,
  point: Point,
  plot: LineSeriesPlot,
  stepped: boolean,
): void {
  const color = plot.data[index - plot.offset]?.color ?? plot.color
  if (state.segment.length === 0 || color !== state.color) startLineSegment(state, plot, color)
  if (stepped && state.previous && state.previous.y !== point.y) {
    const middleX = (state.previous.x + point.x) / 2
    state.segment.push({ x: middleX, y: state.previous.y }, { x: middleX, y: point.y })
  }
  state.segment.push(point)
  state.previous = point
}

/** BR 线在空点处断开；普通线保持前一段，等待后续点连接。 */
function breakLineOnMissing(state: LineSegmentState, plot: LineSeriesPlot): void {
  if (plot.kind !== 'linebr' && plot.kind !== 'steplinebr') return
  state.segment = []
  state.previous = undefined
}

/** 折线与阶梯线共用批次构建；BR 在空点处断开，颜色变化时共享前一有效端点。 */
function buildLineSegments(
  plot: LineSeriesPlot,
  context: PrimitiveRenderContext,
  getPoint: (index: number) => Point | undefined,
  margin: number,
): LineBatch[] {
  const state: LineSegmentState = {
    segment: [],
    color: plot.color,
    previous: undefined,
    previousIndex: context.range.start - margin - 1,
    lines: [],
  }
  const stepped = isStepPlot(plot)
  for (const index of plotIndices(plot, context, margin)) {
    if (index !== state.previousIndex + 1) {
      state.segment = []
      state.previous = undefined
    }
    state.previousIndex = index
    const point = getPoint(index)
    if (point) appendLinePoint(state, index, point, plot, stepped)
    else breakLineOnMissing(state, plot)
  }
  return state.lines.filter((line) => line.points.length >= 2)
}

/** Histogram 的固定像素宽度矩形；不参与 Columns 的槽位填充规则。 */
function buildHistogramRects(
  plot: HistogramPlot,
  context: PrimitiveRenderContext,
  points: ReadonlyMap<number, Point>,
): RectBatch[] {
  const batches = new Map<string, RectBatch>()
  const baselineY = context.pane.yAxis.priceToY(plot.baseline)
  if (!Number.isFinite(baselineY)) return []
  const widthPx = Math.max(1, Math.round(histogramWidth(plot.size) * context.dpr))
  for (let index = context.range.start; index < context.range.end; index++) {
    const point = points.get(index)
    if (!point) continue
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
    const offset = batch.count++ * 4
    batch.buf[offset] = calcBarLeftPx(Math.round(point.x * context.dpr), widthPx) / context.dpr
    batch.buf[offset + 1] = vertical.y
    batch.buf[offset + 2] = widthPx / context.dpr
    batch.buf[offset + 3] = vertical.height
  }
  return [...batches.values()]
}

/** Plot 投影器统一签名。 */
type PlotProjector = (
  plot: Plot,
  context: PrimitiveRenderContext,
  needsPoints: boolean,
) => PlotProjection

/** 线型投影：step/BR 共享同一批次构建。 */
function isLineSeriesPlot(plot: Plot): plot is LineSeriesPlot {
  return (
    plot.kind === 'line' ||
    plot.kind === 'linebr' ||
    plot.kind === 'stepline' ||
    plot.kind === 'steplinebr'
  )
}

function projectLineProjection(
  plot: Plot,
  context: PrimitiveRenderContext,
  needsPoints: boolean,
): PlotProjection {
  if (!isLineSeriesPlot(plot)) throw new TypeError('Expected line plot')
  const margin = lineMargin(context)
  // 只有被填充引用的线才需要按下标保留点；其余线在单遍构建里直接投影。
  if (!needsPoints) {
    return {
      kind: 'line',
      plot,
      points: EMPTY_POINTS,
      lines: buildLineSegments(
        plot,
        context,
        (index) => projectPricePoint(plot, index, context),
        margin,
      ),
    }
  }
  const points = projectPoints(
    plot,
    context,
    (index) => projectPricePoint(plot, index, context),
    margin,
  )
  return {
    kind: 'line',
    plot,
    points,
    lines: buildLineSegments(plot, context, (index) => points.get(index), margin),
  }
}

function projectOhlcProjection(
  plot: Plot,
  context: PrimitiveRenderContext,
  _needsPoints: boolean,
): PlotProjection {
  if (plot.kind !== 'candle' && plot.kind !== 'bar') throw new TypeError('Expected OHLC plot')
  return projectOhlcPlot(plot, context)
}

function projectColumnsProjection(
  plot: Plot,
  context: PrimitiveRenderContext,
  _needsPoints: boolean,
): PlotProjection {
  if (plot.kind !== 'columns') throw new TypeError('Expected columns plot')
  const points = projectPoints(plot, context, (index) => projectPricePoint(plot, index, context))
  return { kind: 'columns', plot, points }
}

function projectHistogramProjection(
  plot: Plot,
  context: PrimitiveRenderContext,
  _needsPoints: boolean,
): PlotProjection {
  if (plot.kind !== 'histogram') throw new TypeError('Expected histogram plot')
  const points = projectPoints(plot, context, (index) => projectPricePoint(plot, index, context))
  return { kind: 'histogram', plot, points, rects: buildHistogramRects(plot, context, points) }
}

function projectPointsProjection(
  plot: Plot,
  context: PrimitiveRenderContext,
  _needsPoints: boolean,
): PlotProjection {
  if (plot.kind !== 'points') throw new TypeError('Expected points plot')
  const points = projectPoints(plot, context, (index) => projectPricePoint(plot, index, context))
  return { kind: 'points', plot, points }
}

function projectMarkerProjection(
  plot: Plot,
  context: PrimitiveRenderContext,
  _needsPoints: boolean,
): PlotProjection {
  if (plot.kind !== 'shape' && plot.kind !== 'char' && plot.kind !== 'arrow') {
    throw new TypeError('Expected marker plot')
  }
  return projectMarkers(plot, context)
}

const PLOT_PROJECTORS: Record<Plot['kind'], PlotProjector> = {
  candle: projectOhlcProjection,
  bar: projectOhlcProjection,
  line: projectLineProjection,
  linebr: projectLineProjection,
  stepline: projectLineProjection,
  steplinebr: projectLineProjection,
  columns: projectColumnsProjection,
  histogram: projectHistogramProjection,
  points: projectPointsProjection,
  shape: projectMarkerProjection,
  char: projectMarkerProjection,
  arrow: projectMarkerProjection,
}

/** 投影单个 Plot；每种 kind 只构建自己绘制所需的数据。 */
function projectPlot(
  plot: Plot,
  context: PrimitiveRenderContext,
  needsPoints: boolean,
): PlotProjection {
  return PLOT_PROJECTORS[plot.kind](plot, context, needsPoints)
}

/** 全列统计箭头幅度，屏幕缩放与可见范围不改变长度。 */
function arrowMagnitude(plot: ArrowPlot): number {
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
function projectMarkers(
  plot: MarkerProjection['plot'],
  context: PrimitiveRenderContext,
): MarkerProjection {
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
  context: PrimitiveRenderContext,
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
  return {
    fill,
    bands: buildFillBands(
      from.points,
      to.points,
      fill.colors,
      from.plot.offset,
      isStepPlot(from.plot),
      isStepPlot(to.plot),
    ),
  }
}

/** 一次投影构建全部重放数据，滚动重放不重新投影也不重新查找。 */
function collectGeometry(state: PlotRenderState, context: PrimitiveRenderContext): PlotGeometry {
  // 填充只按 id 引用两端，先收集引用集合，未被引用的线不必保留点表。
  const filled = new Set<string>()
  for (const fill of state.fills) {
    filled.add(fill.from)
    filled.add(fill.to)
  }
  const plots = state.plots.map((plot) => projectPlot(plot, context, filled.has(plot.id)))
  const byId = new Map(plots.map((projection) => [projection.plot.id, projection]))
  return { plots, fills: state.fills.map((fill) => resolveFill(fill, byId)) }
}

/** 绘制一个指标实例的全部填充、参考线和 Plot；几何按当前帧即时投影。 */
export function paintPlots(state: PlotRenderState, context: PrimitiveRenderContext): void {
  paintGeometry(state, context, collectGeometry(state, context))
}

/** 绘制对齐到 Plot 的填充带。 */
function paintFillBands(
  commands: PaintPrimitive[],
  fills: PlotGeometry['fills'],
  offsetX: number,
): void {
  for (const fill of fills) {
    if (!fill.fill.visible) continue
    for (const band of fill.bands) {
      commands.push({ kind: 'fill', paths: band.polygons, color: band.color, band: true, offsetX })
    }
  }
}

/** 绘制穿过整个 Pane 宽度的水平参考带。 */
function paintGuideFills(
  commands: PaintPrimitive[],
  bands: PlotRenderState['guideFills'],
  context: PrimitiveRenderContext,
): void {
  for (const band of bands) {
    if (!band.visible) continue
    const fromY = context.pane.yAxis.priceToY(band.from)
    const toY = context.pane.yAxis.priceToY(band.to)
    if (!Number.isFinite(fromY) || !Number.isFinite(toY)) continue
    const height = Math.abs(fromY - toY)
    if (height <= 0) continue
    commands.push({
      kind: 'rect',
      x: 0,
      y: Math.min(fromY, toY),
      width: context.paneWidth,
      height,
      color: band.color,
    })
  }
}

/** 绘制水平参考线。 */
function paintGuides(
  commands: PaintPrimitive[],
  guides: PlotRenderState['guides'],
  context: PrimitiveRenderContext,
): void {
  for (const guide of guides) {
    const y = context.pane.yAxis.priceToY(guide.value)
    if (!Number.isFinite(y)) continue
    commands.push({
      kind: 'stroke',
      paths: [
        [
          { x: 0, y },
          { x: context.paneWidth, y },
        ],
      ],
      color: guide.color,
      width: guide.width,
      dash: guide.dash,
    })
  }
}

/** 各投影类型共享的绘制签名。 */
type ProjectionPainter = (
  commands: PaintPrimitive[],
  projection: PlotProjection,
  context: PrimitiveRenderContext,
  offsetX: number,
) => void

/** 折线批次描边。 */
function paintLineProjection(
  commands: PaintPrimitive[],
  projection: PlotProjection,
  _context: PrimitiveRenderContext,
  offsetX: number,
): void {
  if (projection.kind !== 'line') throw new TypeError('Expected line projection')
  for (const line of projection.lines) {
    commands.push({
      kind: 'stroke',
      paths: [line.points],
      color: line.color,
      width: line.width,
      dash: projection.plot.dash,
      cap: 'round',
      join: 'round',
      offsetX,
    })
  }
}

/** Columns 直接消费当前槽位上下文。 */
function paintColumnsProjection(
  commands: PaintPrimitive[],
  projection: PlotProjection,
  context: PrimitiveRenderContext,
): void {
  if (projection.kind !== 'columns') throw new TypeError('Expected columns projection')
  commands.push(...projectColumnPrimitives(projection.plot, projection.points, context))
}

/** Histogram / candle / bar 共用同一矩形批次执行器。 */
function paintBarProjection(
  commands: PaintPrimitive[],
  projection: PlotProjection,
  context: PrimitiveRenderContext,
): void {
  if (
    projection.kind !== 'histogram' &&
    projection.kind !== 'candle' &&
    projection.kind !== 'bar'
  ) {
    throw new TypeError('Expected bar projection')
  }
  commands.push(
    ...projectBarPrimitives(projection.rects, context.scrollLeft, context.dpr, context.paneWidth),
  )
}

/** 散点圆。 */
function paintPointsProjection(
  commands: PaintPrimitive[],
  projection: PlotProjection,
  context: PrimitiveRenderContext,
): void {
  if (projection.kind !== 'points') throw new TypeError('Expected points projection')
  for (const [index, point] of projection.points) {
    commands.push({
      kind: 'circle',
      x: point.x - context.scrollLeft,
      y: point.y,
      radius: pointRadius(projection.plot.size),
      color: projection.plot.data[index - projection.plot.offset]?.color ?? projection.plot.color,
    })
  }
}

/** 形状 / 字符 / 箭头标记。 */
function paintMarkerProjection(
  commands: PaintPrimitive[],
  projection: PlotProjection,
  context: PrimitiveRenderContext,
): void {
  if (projection.kind !== 'shape' && projection.kind !== 'char' && projection.kind !== 'arrow') {
    throw new TypeError('Expected marker projection')
  }
  for (const point of projection.points.values()) {
    commands.push(
      ...markerPrimitives(
        point.glyph,
        point.x - context.scrollLeft,
        point.y,
        point.color,
        point.textColor,
        context.dpr,
      ),
    )
  }
}

const PROJECTION_PAINTERS: Record<PlotProjection['kind'], ProjectionPainter> = {
  line: paintLineProjection,
  columns: paintColumnsProjection,
  histogram: paintBarProjection,
  candle: paintBarProjection,
  bar: paintBarProjection,
  points: paintPointsProjection,
  shape: paintMarkerProjection,
  char: paintMarkerProjection,
  arrow: paintMarkerProjection,
}

/** 按投影类型提交对应的绘制原语。 */
function paintProjection(
  commands: PaintPrimitive[],
  projection: PlotProjection,
  context: PrimitiveRenderContext,
  offsetX: number,
): void {
  if (!projection.plot.visible) return
  PROJECTION_PAINTERS[projection.kind](commands, projection, context, offsetX)
}

/** 用一帧几何绘制填充、参考线和 Plot；几何已由调用方投影完成。 */
function paintGeometry(
  state: PlotRenderState,
  context: PrimitiveRenderContext,
  geometry: PlotGeometry,
): void {
  const commands: PaintPrimitive[] = []
  // 描边算法按屏幕像素计算线宽与连接；价格在投影阶段转换，后端只扣除横向滚动。
  const offsetX = context.scrollLeft
  paintFillBands(commands, geometry.fills, offsetX)
  paintGuideFills(commands, state.guideFills, context)
  paintGuides(commands, state.guides, context)
  for (const projection of geometry.plots) {
    paintProjection(commands, projection, context, offsetX)
  }
  submitPrimitives(context, commands, context.dpr)
}

type OhlcBatchAppender = (part: string, color: string | null, rects: readonly OhlcRect[]) => void

/** 美国线固定为 ohlc-bar；空色蜡烛使用空心实体。 */
function resolveOhlcShape(
  plot: OhlcPlot,
  point: OhlcPlot['data'][number],
): OhlcGeometryInput['shape'] {
  if (plot.kind === 'bar') return 'ohlc-bar'
  return point?.color === null ? 'hollow-candlestick' : 'candlestick'
}

/** 把单个数据点的价格转换为 OHLC 矩形几何。 */
function buildOhlcPointGeometry(
  plot: OhlcPlot,
  point: NonNullable<OhlcPlot['data'][number]>,
  center: number,
  context: PrimitiveRenderContext,
  axis: PrimitiveRenderContext['pane']['yAxis'],
): ReturnType<typeof projectOhlc> | null {
  const openY = axis.priceToY(point.open)
  const highY = axis.priceToY(point.high)
  const lowY = axis.priceToY(point.low)
  const closeY = axis.priceToY(point.close)
  if (![openY, highY, lowY, closeY].every(Number.isFinite)) return null
  return projectOhlc({
    openY,
    highY,
    lowY,
    closeY,
    center,
    widthPx: context.kWidthPx,
    dpr: context.dpr,
    zoomLevel: context.zoomLevel ?? 1,
    shape: resolveOhlcShape(plot, point),
    separateBorder: point.borderColor !== null && point.borderColor !== point.color,
  })
}

/** 按 body / border / wick 三部分写入同色批次。 */
function appendOhlcBatches(
  append: OhlcBatchAppender,
  point: NonNullable<OhlcPlot['data'][number]>,
  geometry: ReturnType<typeof projectOhlc>,
): void {
  append('body', point.color, geometry.body)
  append('border', point.borderColor, geometry.border)
  append('wick', point.wickColor, geometry.wick)
}

/** 按部分与颜色汇聚 OHLC 矩形；同色批次一次提交给现有 GPU/Canvas 绘制链路。 */
function projectOhlcPlot(plot: OhlcPlot, context: PrimitiveRenderContext): OhlcProjection {
  const batches = new Map<string, { color: string; values: number[] }>()
  /** null 隐藏对应部分，颜色本身携带透明度。 */
  function append(part: string, color: string | null, rects: readonly OhlcRect[]): void {
    if (color === null || rects.length === 0) return
    const key = `${part}:${color}`
    let batch = batches.get(key)
    if (!batch) {
      batch = { color, values: [] }
      batches.set(key, batch)
    }
    for (const rect of rects) batch.values.push(...rect)
  }
  const start = ohlcPlotStart(plot)
  for (const index of plotIndices(plot, context)) {
    const sourceIndex = index - plot.offset
    if (sourceIndex < start) continue
    const point = plot.data[sourceIndex]
    const center = projectX(index, context)
    if (!point || center === null) continue
    const geometry = buildOhlcPointGeometry(plot, point, center, context, context.pane.yAxis)
    if (!geometry) continue
    appendOhlcBatches(append, point, geometry)
  }
  return {
    kind: plot.kind,
    plot,
    points: new Map(),
    rects: [...batches.values()].map(({ color, values }) => ({
      color,
      buf: new Float64Array(values),
      count: values.length / 4,
    })),
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
    kind: 'draw-list',
    draw(context) {
      const state = context.indicatorStateReader?.get<PlotRenderState>(options.instanceId)
      if (state?.kind !== 'plots') return
      const geometry = retained.read(
        createProjectionRevision(context, [
          state.plots,
          state.fills,
          context.data,
          context.theme,
          context.zoomLevel ?? 1,
        ]),
        () => collectGeometry(state, context),
      )
      paintGeometry(state, context, geometry)
    },
    dispose: () => retained.clear(),
  })
}
