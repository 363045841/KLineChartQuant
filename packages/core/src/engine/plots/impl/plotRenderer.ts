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
import { barVerticalRect, projectBarBatches } from '@/engine/renderers/barGeometry/impl/projectBars.js'
import { createIndicatorRendererLayer } from '@/engine/renderers/Indicator/shared/indicatorRendererLayer.js'
import { projectOhlc } from '@/engine/renderers/ohlcGeometry/impl/projectOhlc.js'
import type { OhlcRect } from '@/engine/renderers/ohlcGeometry/types.js'
import { logicalIndexToScreenX } from '@/engine/viewport/logicalIndexToScreenX.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { createRetainedGeometry } from '@/rendering/scene/retainedGeometry.js'
import type { Layer } from '@/rendering/scene/types.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive, PrimitivePath } from '@/rendering/primitives/types.js'
import type { PlotRenderState } from '../types.js'
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

/** 柱状图与柱形图的投影结果：几何相同，只有柱宽来源不同。 */
interface ColumnProjection {
  readonly kind: 'histogram' | 'columns'
  readonly plot: HistogramPlot | ColumnsPlot
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
function barValue(plot: ScalarPlot, index: number): number | undefined {
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
  plot: LineSeriesPlot | HistogramPlot | ColumnsPlot | PointsPlot,
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

/** 判断 Plot 是否采用中点跳变的阶梯形状，供路径与填充共同使用。 */
function isStepPlot(plot: Plot): boolean {
  return plot.kind === 'stepline' || plot.kind === 'steplinebr'
}

/** 折线与阶梯线共用批次构建；BR 在空点处断开，颜色变化时共享前一有效端点。 */
function buildLineSegments(
  plot: LineSeriesPlot,
  context: RenderContext,
  points: ReadonlyMap<number, Point>,
): LineBatch[] {
  const lines: LineBatch[] = []
  const stepped = isStepPlot(plot)
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
      if (plot.kind === 'linebr' || plot.kind === 'steplinebr') {
        segment = []
        previous = undefined
      }
      continue
    }
    const nextColor = plot.data[index - plot.offset]?.color ?? plot.color
    if (segment.length === 0 || nextColor !== color) {
      segment = previous ? [previous] : []
      color = nextColor
      lines.push({ points: segment, width: lineWidth(plot.size), color })
    }
    if (stepped && previous && previous.y !== point.y) {
      const middleX = (previous.x + point.x) / 2
      segment.push({ x: middleX, y: previous.y }, { x: middleX, y: point.y })
    }
    segment.push(point)
    previous = point
  }
  return lines.filter((line) => line.points.length >= 2)
}

/** 构建柱体几何：histogram 用固定像素宽，columns 沿用 K 线实体宽度。 */
function buildColumnRects(
  plot: HistogramPlot | ColumnsPlot,
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
    // histogram 柱宽固定为逻辑像素，columns 跟随 K 线实体宽度，两者都按 bar 中心对齐。
    const width = plot.kind === 'histogram' ? histogramWidth(plot.size) : bar.width
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
    case 'candle':
    case 'bar':
      return projectOhlcPlot(plot, context)
    case 'line':
    case 'linebr':
    case 'stepline':
    case 'steplinebr': {
      const points = projectPoints(plot, context, (index) =>
        projectPricePoint(plot, index, context),
      )
      return { kind: 'line', plot, points, lines: buildLineSegments(plot, context, points) }
    }
    case 'histogram':
    case 'columns': {
      const points = projectPoints(plot, context, (index) =>
        projectPricePoint(plot, index, context),
      )
      return { kind: plot.kind, plot, points, rects: buildColumnRects(plot, context, points) }
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
  return {
    fill,
    bands: buildFillBands(
      from.points,
      to.points,
      fill.colors,
      isStepPlot(from.plot),
      isStepPlot(to.plot),
    ),
  }
}

/** 一次投影构建全部重放数据，滚动重放不重新投影也不重新查找。 */
function collectGeometry(state: PlotRenderState, context: RenderContext): PlotGeometry {
  const plots = state.plots.map((plot) => projectPlot(plot, context))
  const byId = new Map(plots.map((projection) => [projection.plot.id, projection]))
  return { plots, fills: state.fills.map((fill) => resolveFill(fill, byId)) }
}

/** 绘制一个指标实例的全部填充、参考线和 Plot；几何按当前帧即时投影。 */
export function paintPlots(state: PlotRenderState, context: RenderContext): void {
  paintGeometry(state, context, collectGeometry(state, context))
}

/** 用一帧几何绘制填充、参考线和 Plot；几何已由调用方投影完成。 */
function paintGeometry(
  state: PlotRenderState,
  context: RenderContext,
  geometry: PlotGeometry,
): void {
  const commands: PaintPrimitive[] = []
  const screen = (path: PrimitivePath) => path.map(point => ({ x: point.x - context.scrollLeft, y: point.y }))
  for (const fill of geometry.fills) if (fill.fill.visible) for (const band of fill.bands) {
    commands.push({ kind: 'fill', paths: band.polygons.map(screen), color: band.color })
  }
  for (const guide of state.guides) {
    const y = context.pane.yAxis.priceToY(guide.value)
    if (!Number.isFinite(y)) continue
    commands.push({ kind: 'stroke', paths: [[{ x: 0, y }, { x: context.paneWidth, y }]], color: guide.color, width: 1, dash: guide.dash })
  }
  for (const projection of geometry.plots) {
    if (!projection.plot.visible) continue
    switch (projection.kind) {
      case 'line':
        for (const line of projection.lines) commands.push({ kind: 'stroke', paths: [screen(line.points)], color: line.color, width: line.width, dash: projection.plot.dash, cap: 'round', join: 'round' })
        break
      case 'histogram':
      case 'columns':
      case 'candle':
      case 'bar':
        for (const batch of projectBarBatches(projection.rects, context.scrollLeft, context.dpr)) {
          for (let i = 0; i < batch.count * 4; i += 4) commands.push({ kind: 'rect', x: batch.buf[i]! / context.dpr, y: batch.buf[i + 1]! / context.dpr, width: batch.buf[i + 2]! / context.dpr, height: batch.buf[i + 3]! / context.dpr, color: batch.color })
        }
        break
      case 'points':
        for (const [index, point] of projection.points) commands.push({ kind: 'circle', x: point.x - context.scrollLeft, y: point.y, radius: pointRadius(projection.plot.size), color: projection.plot.data[index - projection.plot.offset]?.color ?? projection.plot.color })
        break
      case 'shape':
      case 'char':
      case 'arrow':
        for (const point of projection.points.values()) commands.push(...markerPrimitives(point.glyph, point.x - context.scrollLeft, point.y, point.color, point.textColor, context.dpr))
        break
    }
  }
  primitiveSink(context.sceneRenderer?.primitives)(context.ctx, commands, context.dpr)
}

/** 按部分与颜色汇聚 OHLC 矩形；同色批次一次提交给现有 GPU/Canvas 绘制链路。 */
function projectOhlcPlot(plot: OhlcPlot, context: RenderContext): OhlcProjection {
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
    const axis = context.pane.yAxis
    const openY = axis.priceToY(point.open)
    const highY = axis.priceToY(point.high)
    const lowY = axis.priceToY(point.low)
    const closeY = axis.priceToY(point.close)
    if (![openY, highY, lowY, closeY].every(Number.isFinite)) continue
    const geometry = projectOhlc({
      openY,
      highY,
      lowY,
      closeY,
      center,
      widthPx: context.kWidthPx,
      dpr: context.dpr,
      zoomLevel: context.zoomLevel ?? 1,
      shape:
        plot.kind === 'bar'
          ? 'ohlc-bar'
          : point.color === null
            ? 'hollow-candlestick'
            : 'candlestick',
      separateBorder: point.borderColor !== null && point.borderColor !== point.color,
    })
    for (const [part, color, rects] of [
      ['body', point.color, geometry.body],
      ['border', point.borderColor, geometry.border],
      ['wick', point.wickColor, geometry.wick],
    ] as const) {
      append(part, color, rects)
    }
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
    draw(context) {
      const state = context.indicatorStateReader?.get<PlotRenderState>(options.instanceId)
      if (state?.kind !== 'plots') return
      const geometry = retained.read(
        createProjectionRevision(context, [state.plots, state.fills, context.data, context.theme]),
        () => collectGeometry(state, context),
      )
      paintGeometry(state, context, geometry)
    },
    dispose: () => retained.clear(),
  })
}
