/** 将当前 Pane 的绘图一次性投影为图元和轴装饰数据。 */

import { isDrawingInteractive } from '@363045841yyt/klinechart-plot-contracts'
import { resolveChartWorkspaceId } from '@/engine/chartModel/index.js'
import { registerAxisLabel } from '@/engine/renderers/impl/labels/index.js'
import { logicalIndexToScreenX } from '@/engine/viewport/logicalIndexToScreenX.js'
import { createKLineSlotGrid } from '@/engine/viewport/slotGrid.js'
import type { Point } from '@/foundation/geometry/index.js'
import {
  AXIS_LABEL_KIND,
  type DrawingFrameProjection,
  type DrawingPrimitive,
  type DrawingStyle,
  POINT_ROLE,
  PRIMITIVE_KIND,
  type RenderContext,
  type SnapLine,
  type XAxisRange,
  type YAxisRange,
} from '@/foundation/plugin/index.js'
import {
  createScriptColorResolver,
  resolveThemeColors,
  type ScriptColorResolver,
} from '@/foundation/tokens/index.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import type { KLineData } from '@/foundation/types/price.js'
import { resolveAxisTimeLabel } from '@/foundation/utils/futureSlotLabel.js'
import { resolveLineMidHandles } from '../../handles/impl/layout.js'
import type { DrawingHandlePort } from '../../handles/types.js'
import { createSelectionMarqueePrimitives } from '../../interaction/impl/selectionMarquee.js'
import type { DrawingSelectionMarquee, DrawingSnapIndicator } from '../../interaction/types.js'
import { drawingLabelIndexKey } from '../../model/impl/drawingLabels.js'
import type { DrawingDefinitionRegistry } from '../../render/impl/DrawingDefinitionRegistry.js'
import type { DrawingStore } from '../../render/impl/DrawingStore.js'
import type { DrawingPaintScope } from '../../render/types.js'
import { PREVIEW_ID } from '../../session/impl/DrawingSessionOverlay.js'
import type {
  DrawingGeometry,
  DrawingKind,
  DrawingObject,
  ResolvedDrawingAnchor,
  ResolvedDrawingObject,
} from '../../types.js'
import { intersectsDrawingRange } from './drawingExtent.js'
import { LINE_LABEL_BASELINE } from './labelLayout.js'
import { drawingTimeIndex } from './timeCoordinate.js'

type MutableDrawingFrameProjection = {
  primitives: DrawingPrimitive[]
  yAxisRanges: YAxisRange[]
  xAxisRanges: XAxisRange[]
  snapLines: SnapLine[]
}

/** 基于当前帧中心点解析锚点屏幕坐标，分时与 K 线共用同一映射。 */
function createToScreen(context: RenderContext): (anchor: ResolvedDrawingAnchor) => Point {
  const { pane, range, kLineCenters, scrollLeft } = context
  const grid =
    context.dataView === ChartDataViewId.KLine
      ? createKLineSlotGrid(context.kWidth, context.kGap, context.dpr)
      : undefined
  return (anchor) => {
    const x = logicalIndexToScreenX({
      index: anchor.index,
      visibleRange: range,
      centers: kLineCenters,
      scrollLeft,
      dpr: context.dpr,
      fallbackStep: context.kWidth + context.kGap,
      grid,
    })
    return { x: x ?? Number.NaN, y: pane.yAxis.priceToY(anchor.price) }
  }
}

/** 缺失时间锚点对应的数据时不能生成几何，禁止复用旧位置。 */
function hasResolvableTimeAnchors(drawing: ResolvedDrawingObject): boolean {
  return drawing.anchors.every((anchor) => {
    if (!Number.isFinite(anchor.price)) return false
    if (anchor.logicalIndex !== undefined) return Number.isFinite(anchor.index)
    const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
    return (
      timestamp === undefined ||
      (drawing.xloc === 'bar_time' ? Number.isFinite(anchor.index) : anchor.index >= 0)
    )
  })
}

/** 将持久化时间锚点重新定位到当前数据序列，避免历史数据 prepend 后沿用过期 index。 */
function resolveDrawingForFrame(
  drawing: import('../../types.js').DrawingObject,
  getLogicalIndexAtTimestamp: (timestamp: number) => number | null,
  context: RenderContext,
): ResolvedDrawingObject {
  return {
    ...drawing,
    anchors: drawing.anchors.map((anchor) => {
      if (anchor.logicalIndex !== undefined) return { ...anchor, index: anchor.logicalIndex }
      const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
      if (drawing.xloc === 'bar_time' && timestamp !== undefined) {
        return {
          ...anchor,
          index: drawingTimeIndex(timestamp, context.data, context.getTimestampAtLogicalIndex),
        }
      }
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

/** 解析图元样式里的颜色：脚本别名换成当前主题色值，缺省的可选颜色保持缺省。 */
function resolveDrawingStyle(style: DrawingStyle, resolve: ScriptColorResolver): DrawingStyle {
  return {
    ...style,
    stroke: resolve(style.stroke),
    ...(style.fill === undefined ? {} : { fill: resolve(style.fill) }),
    ...(style.textColor === undefined ? {} : { textColor: resolve(style.textColor) }),
  }
}

/** 手柄点：锚点圆点与线段平移方块，两者都只在选中态可见。 */
function isHandlePoint(primitive: DrawingPrimitive): boolean {
  return (
    primitive.kind === PRIMITIVE_KIND.point &&
    (primitive.role === POINT_ROLE.anchor || primitive.role === POINT_ROLE['translate-handle'])
  )
}

/** 锚点只在选中态可见：未选中的图元不画线段端点，也不投影任何手柄点。 */
function withoutAnchorVisuals(primitive: DrawingPrimitive): DrawingPrimitive | null {
  if (primitive.kind === PRIMITIVE_KIND.line) return { ...primitive, showEndpoints: false }
  if (isHandlePoint(primitive)) return null
  return primitive
}

/**
 * 选中态把图元描边对齐到自身 style；未选中态不投影锚点。
 * 创建中的预览例外：正在放置的点需要即时反馈，保留端点与锚点。
 */
function resolveStyledPrimitives(
  primitives: ReadonlyArray<DrawingPrimitive>,
  drawing: ResolvedDrawingObject,
  isSelected: boolean,
): DrawingPrimitive[] {
  if (isSelected) {
    return primitives.map((primitive) => applySelectedStyle(primitive, drawing.style))
  }
  if (drawing.id === PREVIEW_ID) return [...primitives]
  return primitives.map(withoutAnchorVisuals).filter((primitive) => primitive !== null)
}

/**
 * 将选中图元的 primitive 视觉样式提升，保持原始 geometry 不变。
 * 锚点视觉由渲染端统一处理（白底 + 图元色描边环）；这里只把描边对齐到图元 stroke，
 * 不覆写 strokeWidth，避免改变图元的原始视觉重量。
 */
function applySelectedStyle(
  primitive: DrawingPrimitive,
  baseStyle: DrawingStyle,
): DrawingPrimitive {
  if (primitive.kind === PRIMITIVE_KIND.text) return primitive
  return { ...primitive, style: { ...primitive.style, stroke: baseStyle.stroke } }
}

/**
 * 选中图元的线段中点手柄：位置由手柄布局统一解析，这里只负责转成绘制原语。
 * 与锚点同色、同半径，形状由绘制侧决定。
 * @param drawing 已解析到当前帧的图元
 * @param port 帧投影端口（锚点投影 + 本帧 Pane 边界）
 */
function projectLineMidHandlePrimitives(
  drawing: ResolvedDrawingObject,
  port: DrawingHandlePort<ResolvedDrawingAnchor>,
): DrawingPrimitive[] {
  return resolveLineMidHandles(drawing, port).map(
    (handle): DrawingPrimitive => ({
      kind: PRIMITIVE_KIND.point,
      role: POINT_ROLE['translate-handle'],
      point: handle.point,
      style: { stroke: drawing.style.stroke },
    }),
  )
}

/** 将持久化文本附加到对应线段；锚点、旋转、对齐与基线由渲染器和热点共用同一约定。 */
function attachLineLabels(
  drawing: ResolvedDrawingObject,
  primitives: ReadonlyArray<DrawingPrimitive>,
): DrawingPrimitive[] {
  let lineIndex = 0
  return primitives.map((primitive) => {
    if (primitive.kind !== PRIMITIVE_KIND.line && primitive.kind !== PRIMITIVE_KIND.arrow) {
      return primitive
    }
    const label = drawing.labels?.line[drawingLabelIndexKey(lineIndex++)]
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
    if (primitive.kind !== PRIMITIVE_KIND.area) return primitive
    const label = drawing.labels?.area[drawingLabelIndexKey(areaIndex++)]
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
  toScreen: (anchor: ResolvedDrawingAnchor) => Point,
  output: MutableDrawingFrameProjection,
): void {
  if (context.pane.role !== 'price') return
  const color = style.stroke
  const priceLabelOnly = PRICE_LABEL_ONLY_KINDS.has(kind)
  const timeLabelOnly = TIME_LABEL_ONLY_KINDS.has(kind)
  const series = context.data
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.price)) continue
    // 水平类图元横贯整个视口，价格轴标签不依赖锚点时间是否在可视范围内。
    const indexVisible =
      Number.isFinite(anchor.index) &&
      anchor.index >= context.range.start &&
      anchor.index < context.range.end
    const anchorTimestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
    // futureOffset 的 time 是创建时的基准 bar，不是该槽位的日期；
    // 槽位已变为真实 bar 时取 bar 时间，仍在未来时只取交易日历。
    const timestamp =
      anchor.index >= series.length
        ? context.getTimestampAtLogicalIndex(anchor.index)
        : anchor.futureOffset !== undefined
          ? (series[anchor.index]?.timestamp ?? null)
          : anchorTimestamp !== undefined && Number.isFinite(anchorTimestamp)
            ? anchorTimestamp
            : null
    const wantsPrice = !timeLabelOnly && (priceLabelOnly || indexVisible)
    const timeText =
      !priceLabelOnly && indexVisible
        ? resolveAxisTimeLabel(anchor.index, series.length, timestamp, (ts) =>
            context.displayTimeFormatter.formatDate(ts),
          )
        : null
    if (!wantsPrice && timeText === null) continue

    const point = toScreen(anchor)
    if (wantsPrice && point.y >= 0 && point.y <= context.pane.height) {
      registerAxisLabel(context, 'yRightOverlay', {
        kind: AXIS_LABEL_KIND.TAG,
        text: anchor.price.toFixed(2),
        pos: point.y + context.pane.top,
        origin: context.pane.top,
        variant: 'label',
        bgColor: color,
        borderColor: color,
        textColor: labelTextColor,
        fontSize: 11,
      })
    }
    if (timeText !== null && point.x >= 0 && point.x <= context.paneWidth) {
      registerAxisLabel(context, 'xLabels', {
        kind: AXIS_LABEL_KIND.TAG,
        text: timeText,
        pos: point.x,
        bgColor: color,
        textColor: labelTextColor,
        fontSize: 12,
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

/** 单帧投影的共享状态；把长参数表收敛成一份，避免辅助函数逐个透传。 */
interface FrameProjectionState {
  readonly definitions: DrawingDefinitionRegistry
  readonly context: RenderContext
  readonly selectedIds: ReadonlySet<string>
  readonly toScreen: (anchor: ResolvedDrawingAnchor) => Point
  readonly handlePort: DrawingHandlePort<ResolvedDrawingAnchor>
  readonly themeColors: ReturnType<typeof resolveThemeColors>
  readonly resolveColor: ScriptColorResolver
  readonly getLogicalIndexAtTimestamp: (timestamp: number) => number | null
  readonly handlePrimitives: DrawingPrimitive[]
  readonly output: MutableDrawingFrameProjection
  readonly visibleData: KLineData[]
  readonly seriesData: KLineData[]
}

/** 帧投影端口：锚点经本帧快照投影，边界取本帧 Pane 尺寸；单轴锚点保留单轴语义。 */
function createHandlePort(
  context: RenderContext,
  toScreen: (anchor: ResolvedDrawingAnchor) => Point,
): DrawingHandlePort<ResolvedDrawingAnchor> {
  return {
    bounds: { plotWidth: context.viewport.plotWidth, paneHeight: context.pane.height },
    projectAnchor: (anchor) => {
      const point = toScreen(anchor)
      if (anchor.type === 'horizontal') return { type: 'horizontal', y: point.y }
      if (anchor.type === 'vertical') return { type: 'vertical', x: point.x }
      return { type: 'point', x: point.x, y: point.y }
    },
  }
}

/** 已提交层线段的磁吸候选；会话覆盖不进入候选，拖拽中的图元吸自己会形成反馈回路。 */
function collectSnapLines(
  state: FrameProjectionState,
  drawing: ResolvedDrawingObject,
  geometry: DrawingGeometry,
): void {
  for (const primitive of geometry.primitives) {
    if (primitive.kind !== PRIMITIVE_KIND.line) continue
    state.output.snapLines.push({
      drawingId: drawing.id,
      a: primitive.a,
      b: primitive.b,
      ...horizontalPrice(
        drawing,
        geometry.computedAnchors ?? [],
        state.toScreen,
        primitive.a,
        primitive.b,
      ),
    })
  }
}

/** 投影单个图元；视口外或几何不可解析的图元直接跳过。 */
function projectStoredDrawing(
  state: FrameProjectionState,
  storedDrawing: DrawingObject,
  scope: DrawingPaintScope,
): void {
  const { context, definitions } = state
  const frameDrawing = resolveDrawingForFrame(
    storedDrawing,
    state.getLogicalIndexAtTimestamp,
    context,
  )
  // 图元颜色可能是脚本别名，投影成当前主题色值后再交给几何与渲染。
  const drawing: ResolvedDrawingObject = {
    ...frameDrawing,
    style: resolveDrawingStyle(frameDrawing.style, state.resolveColor),
  }
  if (!hasResolvableTimeAnchors(drawing)) return
  // 视口外图元不进入几何计算；无界图形由定义声明，不在这里猜 kind。
  if (!intersectsDrawingRange(definitions.extent(drawing), context.range)) return
  const geometry = definitions.compute(drawing, {
    pane: context.pane,
    visibleData: state.visibleData,
    seriesData: state.seriesData,
    range: context.range,
    kLinePositions: context.kLinePositions,
    kLineCenters: context.kLineCenters,
    kBarRects: context.kBarRects,
    kWidth: context.kWidth,
    kGap: context.kGap,
    dpr: context.dpr,
    paneWidth: context.paneWidth,
    viewport: context.viewport,
    toScreen: state.toScreen,
  })
  if (!geometry) return
  if (scope === 'committed') collectSnapLines(state, drawing, geometry)
  const isSelected = isDrawingInteractive(drawing) && state.selectedIds.has(drawing.id)
  const primitives = attachAreaLabels(drawing, attachLineLabels(drawing, geometry.primitives))
  state.output.primitives.push(...resolveStyledPrimitives(primitives, drawing, isSelected))
  if (!isSelected) return
  state.handlePrimitives.push(...projectLineMidHandlePrimitives(drawing, state.handlePort))
  projectAxisDecorations(
    drawing.kind,
    [...drawing.anchors, ...(geometry.computedAnchors ?? [])],
    drawing.style,
    state.themeColors.label.text,
    context,
    state.toScreen,
    state.output,
  )
}

/** 按 scope 投影当前 Pane 图元并收集轴标签；先按可见索引区间裁掉视口外图元。 */
export function projectDrawingsForFrame(
  store: DrawingStore,
  definitions: DrawingDefinitionRegistry,
  context: RenderContext,
  selectionMarquee: DrawingSelectionMarquee | null = null,
  scope: DrawingPaintScope = 'all',
  snapIndicator: DrawingSnapIndicator | null = null,
): DrawingFrameProjection {
  const output: MutableDrawingFrameProjection = {
    primitives: [],
    yAxisRanges: [],
    xAxisRanges: [],
    snapLines: [],
  }
  const seriesData = context.data as KLineData[]
  const toScreen = createToScreen(context)
  const themeColors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const state: FrameProjectionState = {
    definitions,
    context,
    selectedIds: new Set(store.getSelectedIds()),
    toScreen,
    handlePort: createHandlePort(context, toScreen),
    themeColors,
    resolveColor: createScriptColorResolver(themeColors),
    getLogicalIndexAtTimestamp: context.getLogicalIndexAtTimestamp,
    // 手柄统一在所有图元之后压入，保证不被后画的图元遮住。
    handlePrimitives: [],
    output,
    visibleData: seriesData.slice(context.range.start, context.range.end),
    seriesData,
  }
  const workspaceId = resolveChartWorkspaceId(context.dataView)
  for (const storedDrawing of store.getVisibleByPane(context.pane.id, workspaceId, scope)) {
    projectStoredDrawing(state, storedDrawing, scope)
  }
  output.primitives.push(...state.handlePrimitives)
  if (selectionMarquee?.paneId === context.pane.id) {
    output.primitives.push(...createSelectionMarqueePrimitives(selectionMarquee, themeColors))
  }
  if (snapIndicator?.paneId === context.pane.id) {
    output.primitives.push(createSnapIndicatorPrimitive(snapIndicator, themeColors.selectionStroke))
  }
  return output
}

/**
 * 水平线段的精确价格：找出投影 Y 与该线段相同的锚点，直接取它的领域价格。
 *
 * 这样吸附到水平线时写回的是原值，而不是 `yToPrice(priceToY(price))` 的浮点回环。
 * 非水平线段没有单一价格，不产出该字段。
 */
function horizontalPrice(
  drawing: ResolvedDrawingObject,
  computedAnchors: ReadonlyArray<ResolvedDrawingAnchor>,
  toScreen: (anchor: ResolvedDrawingAnchor) => Point,
  a: Point,
  b: Point,
): Partial<Pick<SnapLine, 'price'>> {
  if (Math.abs(a.y - b.y) > HORIZONTAL_EPSILON) return {}
  for (const anchor of [...drawing.anchors, ...computedAnchors]) {
    if (Math.abs(toScreen(anchor).y - a.y) > HORIZONTAL_EPSILON) continue
    return { price: anchor.price }
  }
  return {}
}

/** 判定「同一水平位置」的半像素容差。 */
const HORIZONTAL_EPSILON = 0.5

/**
 * 磁吸命中指示：命中点上的一枚空心圆点。
 *
 * 复用 point 原语的锚点形状（底色挖空 + 描边），颜色取交互标记 Token，
 * 因此明暗主题与配色预设自动跟随，不需要单独维护一套颜色。
 */
function createSnapIndicatorPrimitive(
  indicator: DrawingSnapIndicator,
  color: string,
): DrawingPrimitive {
  return {
    kind: PRIMITIVE_KIND.point,
    point: { x: indicator.x, y: indicator.y },
    style: { stroke: color },
  }
}
