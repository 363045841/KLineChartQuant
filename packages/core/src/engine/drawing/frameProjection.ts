/** 将当前 Pane 的绘图一次性投影为图元和轴装饰数据。 */
import type {
  DrawingFrameProjection,
  DrawingKind,
  DrawingPrimitive,
  DrawingStyle,
  RenderContext,
  ResolvedDrawingAnchor,
  ResolvedDrawingObject,
  ScreenPoint,
} from '../../foundation/plugin'
import { DEFAULT_DRAWING_STROKE, resolveThemeColors } from '../../foundation/tokens'
import type { KLineData } from '../../foundation/types/price'
import { resolveChartWorkspaceId } from '../state/modeState'
import { logicalIndexToScreenX } from '../viewport/logicalIndexToScreenX'

import { DrawingDefinitionRegistry, DrawingStore } from './index'
import { LINE_LABEL_BASELINE } from './labelLayout'
import { createSelectionMarqueePrimitives, type DrawingSelectionMarquee } from './selectionMarquee'

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
  return (anchor) => {
    if (!Number.isFinite(anchor.index) || anchor.index < 0) {
      return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
    }
    const x = logicalIndexToScreenX({
      index: anchor.index,
      visibleRange: range,
      centers: kLineCenters,
      scrollLeft,
      dpr: context.dpr,
      fallbackStep: context.kWidth + context.kGap,
    })
    return { x: x ?? -kWidth, y: pane.yAxis.priceToY(anchor.price) }
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
      const baseIndex = getLogicalIndexAtTimestamp(timestamp)
      const futureOffset = anchor.futureOffset
      if (futureOffset !== undefined && (!Number.isInteger(futureOffset) || futureOffset <= 0)) {
        return { ...anchor, index: -1 }
      }
      // 时间锚点未落入当前数据时不可复用旧 index，否则会投影到错误的 bar。
      return { ...anchor, index: baseIndex === null ? -1 : baseIndex + (futureOffset ?? 0) }
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
    return {
      ...primitive,
      style: { ...primitive.style, stroke, pointRadius: (baseStyle.pointRadius ?? 4) + 2 },
    }
  }
  if (primitive.kind === 'line' || primitive.kind === 'arrow') {
    return { ...primitive, style: { ...primitive.style, stroke, strokeWidth } }
  }
  if (primitive.kind === 'area') return { ...primitive, style: { ...primitive.style, stroke } }
  return primitive
}

/** 将持久化文本附加到对应线段；锚点、旋转、对齐与基线由渲染器和热点共用同一约定。 */
function attachLineLabels(
  drawing: ResolvedDrawingObject,
  primitives: ReadonlyArray<DrawingPrimitive>,
): DrawingPrimitive[] {
  let lineIndex = 0
  return primitives.map((primitive) => {
    if (primitive.kind !== 'line' && primitive.kind !== 'arrow') return primitive
    const label = drawing.labels?.line[String(lineIndex++)]
    return label === undefined
      ? primitive
      : {
          ...primitive,
          text: { text: label.text, position: label.position, baseline: LINE_LABEL_BASELINE },
        }
  })
}

/** 将持久化文本附加到对应填充区域；文字在填充完成后由区域渲染器绘制。 */
function attachAreaLabels(
  drawing: ResolvedDrawingObject,
  primitives: ReadonlyArray<DrawingPrimitive>,
): DrawingPrimitive[] {
  let areaIndex = 0
  return primitives.map((primitive) => {
    if (primitive.kind !== 'area') return primitive
    const label = drawing.labels?.area[String(areaIndex++)]
    return label === undefined
      ? primitive
      : { ...primitive, text: { text: label.text, position: label.position } }
  })
}

/** 水平类图元只有价格语义：锚点只投影价格轴标签。 */
const PRICE_LABEL_ONLY_KINDS: ReadonlySet<DrawingKind> = new Set([
  'horizontal-line',
  'horizontal-ray',
])

/** 垂直类图元只有时间语义：锚点只投影时间轴标签。 */
const TIME_LABEL_ONLY_KINDS: ReadonlySet<DrawingKind> = new Set(['vertical-line'])

/** 将一个选中图元的锚点投影为坐标轴标签和范围带。 */
function projectAxisDecorations(
  kind: DrawingKind,
  anchors: ReadonlyArray<ResolvedDrawingAnchor>,
  style: DrawingStyle,
  labelTextColor: string,
  context: RenderContext,
  toScreen: (anchor: ResolvedDrawingAnchor) => ScreenPoint,
  output: MutableDrawingFrameProjection,
): void {
  if (context.pane.role !== 'price') return
  const color = style.stroke ?? DEFAULT_DRAWING_STROKE
  const priceLabelOnly = PRICE_LABEL_ONLY_KINDS.has(kind)
  const timeLabelOnly = TIME_LABEL_ONLY_KINDS.has(kind)
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.price)) continue
    // 水平类图元横贯整个视口，价格轴标签不依赖锚点时间是否在可视范围内。
    const indexVisible =
      Number.isFinite(anchor.index) &&
      anchor.index >= context.range.start &&
      anchor.index < context.range.end
    const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
    const wantsPrice = !timeLabelOnly && (priceLabelOnly || indexVisible)
    const wantsTime =
      !priceLabelOnly && indexVisible && timestamp !== undefined && Number.isFinite(timestamp)
    if (!wantsPrice && !wantsTime) continue

    const point = toScreen(anchor)
    if (wantsPrice && point.y >= 0 && point.y <= context.pane.height) {
      output.yAxisLabels.push({
        price: anchor.price,
        y: point.y,
        style: { bgColor: color, borderColor: color, textColor: labelTextColor },
      })
    }
    if (wantsTime && point.x >= -context.kWidth && point.x <= context.paneWidth + context.kWidth) {
      output.xAxisLabels.push({
        timestamp: timestamp!,
        x: point.x + context.scrollLeft,
        style: { bgColor: color, textColor: labelTextColor },
      })
    }
  }
  const valid = anchors.filter(
    (anchor) =>
      Number.isFinite(anchor.index) &&
      anchor.index >= context.range.start &&
      anchor.index < context.range.end &&
      Number.isFinite(anchor.price),
  )
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
  const left =
    toScreen({ id: '', index: Math.min(...indices), price: minPrice }).x + context.scrollLeft
  const right =
    toScreen({ id: '', index: Math.max(...indices), price: maxPrice }).x + context.scrollLeft
  if (left !== right) output.xAxisRanges.push({ leftX: left, rightX: right, color, opacity: 0.15 })
}

/** 生成当前 Pane 的完整绘图帧数据；本函数不修改 RenderContext。 */
export function projectDrawingsForFrame(
  store: DrawingStore,
  definitions: DrawingDefinitionRegistry,
  context: RenderContext,
  selectionMarquee: DrawingSelectionMarquee | null = null,
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
  const visibleData = seriesData.slice(context.range.start, context.range.end)
  // 锚点索引由活动 Buffer 的时间索引解析，RenderContext 已保证解析器存在。
  const getLogicalIndexAtTimestamp = context.getLogicalIndexAtTimestamp
  const toScreen = createToScreen(context)
  const workspaceId = resolveChartWorkspaceId(context.dataView)
  const themeColors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  for (const storedDrawing of store.getVisibleByPane(context.pane.id, workspaceId)) {
    const drawing = resolveDrawingForFrame(storedDrawing, getLogicalIndexAtTimestamp)
    if (!hasResolvableTimeAnchors(drawing)) continue
    const geometry = definitions.compute(drawing, {
      pane: context.pane,
      visibleData,
      seriesData,
      range: context.range,
      kLinePositions: context.kLinePositions,
      kLineCenters: context.kLineCenters,
      kBarRects: context.kBarRects,
      kWidth: context.kWidth,
      kGap: context.kGap,
      dpr: context.dpr,
      paneWidth: context.paneWidth,
      viewport: context.viewport,
      toScreen,
    })
    if (!geometry) continue
    const isSelected = selectedIds.has(drawing.id)
    const primitives = attachAreaLabels(drawing, attachLineLabels(drawing, geometry.primitives))
    const styledPrimitives = isSelected
      ? primitives.map((primitive) => applySelectedStyle(primitive, drawing.style))
      : primitives
    output.primitives.push(...styledPrimitives)
    if (isSelected) {
      projectAxisDecorations(
        drawing.kind,
        [...drawing.anchors, ...(geometry.computedAnchors ?? [])],
        drawing.style,
        themeColors.label.text,
        context,
        toScreen,
        output,
      )
    }
  }
  if (selectionMarquee?.paneId === context.pane.id) {
    output.primitives.push(...createSelectionMarqueePrimitives(selectionMarquee, themeColors))
  }
  return output
}
