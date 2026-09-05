/** 将当前 Pane 的绘图一次性投影为图元和轴装饰数据。 */
import type {
  DrawingFrameProjection,
  DrawingPrimitive,
  ResolvedDrawingAnchor,
  ResolvedDrawingObject,
  DrawingStyle,
  RenderContext,
  ScreenPoint,
} from '../../foundation/plugin'
import type { KLineData } from '../../foundation/types/price'

import { DrawingDefinitionRegistry, DrawingStore } from './index'

type MutableDrawingFrameProjection = {
  primitives: DrawingPrimitive[]
  yAxisLabels: DrawingFrameProjection['yAxisLabels'] extends ReadonlyArray<infer T> ? T[] : never
  yAxisRanges: DrawingFrameProjection['yAxisRanges'] extends ReadonlyArray<infer T> ? T[] : never
  xAxisLabels: DrawingFrameProjection['xAxisLabels'] extends ReadonlyArray<infer T> ? T[] : never
  xAxisRanges: DrawingFrameProjection['xAxisRanges'] extends ReadonlyArray<infer T> ? T[] : never
}

/** 基于当前帧中心点解析锚点屏幕坐标，分时与 K 线共用同一映射。 */
function createToScreen(context: RenderContext): (anchor: ResolvedDrawingAnchor) => ScreenPoint {
  const { pane, range, kLineCenters, scrollLeft, kWidth } = context
  const centerStep =
    kLineCenters.length >= 2
      ? kLineCenters[1]! - kLineCenters[0]!
      : context.kWidth + context.kGap
  return (anchor) => {
    if (!Number.isFinite(anchor.index) || anchor.index < 0) {
      return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
    }
    const relativeIndex = anchor.index - range.start
    const center = kLineCenters[relativeIndex] ?? (kLineCenters[0]! + relativeIndex * centerStep)
    return { x: center - scrollLeft, y: pane.yAxis.priceToY(anchor.price) }
  }
}

/** 缺失时间锚点对应的数据时不能生成几何，禁止复用旧位置。 */
function hasResolvableTimeAnchors(drawing: ResolvedDrawingObject): boolean {
  return drawing.anchors.every((anchor) => {
    const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
    return timestamp === undefined || anchor.index >= 0
  })
}

/** 将持久化时间锚点重新定位到当前数据序列，避免历史数据 prepend 后沿用过期 index。 */
function resolveDrawingForFrame(
  drawing: import('../../foundation/plugin').DrawingObject,
  getLogicalIndexAtTimestamp: (timestamp: number) => number | null,
): ResolvedDrawingObject {
  return {
    ...drawing,
    anchors: drawing.anchors.map((anchor) => {
      const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
      if (timestamp === undefined || !Number.isFinite(timestamp)) return { ...anchor, index: -1 }
      const index = getLogicalIndexAtTimestamp(timestamp)
      // 时间锚点未落入当前数据时不可复用旧 index，否则会投影到错误的 bar。
      return { ...anchor, index: index ?? -1 }
    }),
  }
}

/** 将选中图元的 primitive 视觉样式提升，保持原始 geometry 不变。 */
function applySelectedStyle(
  primitive: DrawingPrimitive,
  baseStyle: DrawingStyle,
): DrawingPrimitive {
  const stroke = baseStyle.stroke
  const strokeWidth = (baseStyle.strokeWidth ?? 1) + 1
  if (primitive.kind === 'point') {
    return { ...primitive, style: { ...primitive.style, stroke, pointRadius: (baseStyle.pointRadius ?? 4) + 2 } }
  }
  if (primitive.kind === 'line' || primitive.kind === 'arrow') {
    return { ...primitive, style: { ...primitive.style, stroke, strokeWidth } }
  }
  if (primitive.kind === 'area') return { ...primitive, style: { ...primitive.style, stroke } }
  return primitive
}

/** 将一个选中图元的锚点投影为坐标轴标签和范围带。 */
function projectAxisDecorations(
  anchors: ReadonlyArray<ResolvedDrawingAnchor>,
  style: DrawingStyle,
  context: RenderContext,
  output: MutableDrawingFrameProjection,
): void {
  if (context.pane.role !== 'price') return
  const color = style.stroke ?? '#2962ff'
  const toScreen = createToScreen(context)
  const valid = anchors.filter(
    (anchor) =>
      Number.isFinite(anchor.index) &&
      anchor.index >= context.range.start &&
      anchor.index < context.range.end &&
      Number.isFinite(anchor.price),
  )
  for (const anchor of valid) {
    const point = toScreen(anchor)
    if (point.y >= 0 && point.y <= context.pane.height) {
      output.yAxisLabels.push({
        price: anchor.price,
        y: point.y,
        style: { bgColor: color, borderColor: color, textColor: '#ffffff' },
      })
    }
    const timestamp =
      typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
    if (timestamp !== undefined && Number.isFinite(timestamp) && point.x >= -context.kWidth && point.x <= context.paneWidth + context.kWidth) {
      output.xAxisLabels.push({
        timestamp,
        x: point.x + context.scrollLeft,
        style: { bgColor: color, textColor: '#ffffff' },
      })
    }
  }
  if (valid.length < 2) return
  const prices = valid.map((anchor) => anchor.price)
  const indices = valid.map((anchor) => anchor.index)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  if (minPrice !== maxPrice) {
    output.yAxisRanges.push({
      topY: context.pane.yAxis.priceToY(maxPrice),
      bottomY: context.pane.yAxis.priceToY(minPrice),
      color,
      opacity: 0.15,
    })
  }
  const left = toScreen({ id: '', index: Math.min(...indices), price: minPrice }).x + context.scrollLeft
  const right = toScreen({ id: '', index: Math.max(...indices), price: maxPrice }).x + context.scrollLeft
  if (left !== right) output.xAxisRanges.push({ leftX: left, rightX: right, color, opacity: 0.15 })
}

/** 生成当前 Pane 的完整绘图帧数据；本函数不修改 RenderContext。 */
export function projectDrawingsForFrame(
  store: DrawingStore,
  definitions: DrawingDefinitionRegistry,
  context: RenderContext,
): DrawingFrameProjection {
  const output: MutableDrawingFrameProjection = {
    primitives: [],
    yAxisLabels: [],
    yAxisRanges: [],
    xAxisLabels: [],
    xAxisRanges: [],
  }
  const selectedIds = new Set(store.getSelectedIds())
  const seriesData = context.data as KLineData[]
  // 锚点索引只能由活动 Buffer 的时间索引解析，缺失解析器时 fail-closed。
  const getLogicalIndexAtTimestamp = context.getLogicalIndexAtTimestamp ?? (() => null)
  const toScreen = createToScreen(context)
  for (const storedDrawing of store.getVisibleByPane(context.pane.id)) {
    const drawing = resolveDrawingForFrame(storedDrawing, getLogicalIndexAtTimestamp)
    if (!hasResolvableTimeAnchors(drawing)) continue
    const geometry = definitions.compute(drawing, {
      pane: context.pane,
      visibleData: seriesData.slice(context.range.start, context.range.end),
      seriesData,
      range: context.range,
      kLinePositions: context.kLinePositions,
      kLineCenters: context.kLineCenters,
      kBarRects: context.kBarRects,
      kWidth: context.kWidth,
      kGap: context.kGap,
      dpr: context.dpr,
      paneWidth: context.paneWidth,
      viewport: context.viewport ?? { scrollLeft: context.scrollLeft, plotWidth: context.paneWidth, plotHeight: context.pane.height },
      toScreen,
    })
    if (!geometry) continue
    const isSelected = selectedIds.has(drawing.id)
    output.primitives.push(
      ...(isSelected
        ? geometry.primitives.map((primitive) => applySelectedStyle(primitive, drawing.style))
        : geometry.primitives),
    )
    if (isSelected) {
      projectAxisDecorations(
        [...drawing.anchors, ...(geometry.computedAnchors ?? [])],
        drawing.style,
        context,
        output,
      )
    }
  }
  return output
}
