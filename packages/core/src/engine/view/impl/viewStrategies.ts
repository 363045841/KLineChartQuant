/** 集中定义各视图的横向行为；模型、绘制和交互不再独立识别周期。 */
import { slotIndexAt, slotWorldX } from '../../../foundation/geometry/slotGrid.js'
import { ChartDataViewId } from '../../../foundation/types/chartView.js'
import {
  resolveMarketSessionSlots,
  resolveTimestampSessionSlot,
} from '../../../foundation/utils/timeShareAxisLabels.js'
import { computeFiveDayTimeShareGeometry } from '../../modes/impl/fiveDayTimeShareGeometry.js'
import { computeTimeShareXLayout } from '../../modes/impl/timeShareMath.js'
import { calcKBarWidthPx, calcKWidthPx } from '../../utils/klineConfig.js'
import { kGapFromKWidth } from '../../utils/zoom.js'
import { createKLineSlotGrid, createTimeShareSlotGrid } from '../../viewport/slotGrid.js'
import type { ViewCapabilities, ViewInput, ViewSnapshot, ViewStrategy } from '../types.js'

const BAR_CAPABILITIES: Readonly<ViewCapabilities> = Object.freeze({
  allowPan: true,
  allowZoom: true,
  allowVerticalScroll: true,
  allowRightAxisScale: true,
})
const FIXED_CAPABILITIES: Readonly<ViewCapabilities> = Object.freeze({
  allowPan: false,
  allowZoom: false,
  allowVerticalScroll: false,
  allowRightAxisScale: false,
})
const SESSION_CAPABILITIES: Readonly<ViewCapabilities> = Object.freeze({
  allowPan: true,
  allowZoom: true,
  allowVerticalScroll: false,
  allowRightAxisScale: false,
})

/** 由中心几何派生共享快照；位置、实体矩形与命中都读同一份中心数组。 */
function snapshot(
  input: ViewInput,
  fields: Omit<ViewSnapshot, 'view' | 'ready' | 'positions' | 'bars' | 'viewportWidth'>,
  barWidth: number,
  visible?: ReadonlyArray<boolean>,
): ViewSnapshot {
  const half = (fields.kWidthPx - 1) / (2 * input.dpr)
  return {
    ...fields,
    view: input.view,
    viewportWidth: input.width,
    // K 线允许整屏落在数据之外；交易视图必须有可绘制的交易中心。
    ready: input.width > 0 && (fields.hoverKind === 'candle' ? true : fields.centers.length > 0),
    positions: fields.centers.map((center) => center - half),
    bars: fields.centers.map((center, index) => ({
      x: center - (Math.round(barWidth * input.dpr) - 1) / (2 * input.dpr),
      width: visible && !visible[index] ? 0 : barWidth,
    })),
  }
}

/** 无界 K 线与对比槽位：负索引、数据索引、未来索引共用中心网格。 */
function projectBars(input: ViewInput): ViewSnapshot {
  const gap = kGapFromKWidth(input.kWidth, input.dpr)
  const grid = createKLineSlotGrid(input.kWidth, gap, input.dpr)
  const start = Math.floor((input.scroll - grid.origin) / grid.step) - 1
  const end = Math.ceil((input.scroll + input.width - grid.origin) / grid.step) + 1
  const range = { start: Math.max(0, start), end: Math.max(0, end) }
  const baseOffset = Math.round(input.width)
  // 逻辑滚动为负时向左扩展同量空白，DOM 位置因此始终非负。
  const domOffset = baseOffset + Math.max(0, -input.scroll - baseOffset)
  const domScroll = input.scroll + domOffset
  const seriesWidth = input.dataLength * grid.step
  const kWidthPx = calcKWidthPx(input.kWidth, input.dpr)
  return snapshot(
    input,
    {
      grid,
      scroll: input.scroll,
      domOffset,
      domScroll,
      // 右侧预留一屏，保证未来槽位可继续滚动而不是被 DOM 边界拦下。
      contentWidth: Math.max(domOffset + seriesWidth + input.width, domScroll + 2 * input.width),
      seriesWidth,
      kWidth: input.kWidth,
      kGap: gap,
      kWidthPx,
      range,
      slotRange: { start, end },
      centers: Array.from({ length: Math.max(0, range.end - range.start) }, (_, index) =>
        slotWorldX(grid, range.start + index),
      ),
      fiveDayGeometry: null,
      capabilities: BAR_CAPABILITIES,
      hoverKind: 'candle',
      hasPriceSeries: true,
      worldAtIndex: (index) => (Number.isInteger(index) ? slotWorldX(grid, index) : null),
      indexAtWorld: (world) => (Number.isFinite(world) ? slotIndexAt(grid, world) : null),
    },
    calcKBarWidthPx(grid.step * input.dpr) / input.dpr,
  )
}

/** 交易数据中心的最近索引；同中心取最后一条数据。 */
function nearestIndex(centers: ReadonlyArray<number>, world: number): number | null {
  if (!centers.length || !Number.isFinite(world)) return null
  let lo = 0
  let hi = centers.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (centers[mid]! <= world) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  if (lo === centers.length) return lo - 1
  return world - centers[lo - 1]! < centers[lo]! - world ? lo - 1 : lo
}

/** 单日分时固定适配全天交易槽位，旧导航与旧槽宽不会影响投影。 */
function projectSingleSession(input: ViewInput): ViewSnapshot {
  const session = input.marketSession
  const slots = session ? resolveMarketSessionSlots(session) : 0
  const grid = createTimeShareSlotGrid(input.width, slots, input.dpr)
  const slotIndices = session
    ? input.data.map((point) =>
        'price' in point ? resolveTimestampSessionSlot(point.timestamp, session) : null,
      )
    : []
  const layout = computeTimeShareXLayout({
    arrivedCount: slotIndices.length,
    sessionSlots: slots,
    totalWidth: input.width,
    dpr: input.dpr,
    slotIndices: slotIndices.filter((index): index is number => index !== null),
  })
  const centers = layout ? layout.centers : []
  const kWidthPx = layout ? layout.kWidthPx : 1
  return snapshot(
    input,
    {
      grid,
      scroll: 0,
      domOffset: 0,
      domScroll: 0,
      contentWidth: input.width,
      seriesWidth: input.width,
      kWidth: kWidthPx / input.dpr,
      kGap: 1 / input.dpr,
      kWidthPx,
      range: { start: 0, end: centers.length },
      slotRange: { start: -1, end: slots },
      centers,
      fiveDayGeometry: null,
      capabilities: FIXED_CAPABILITIES,
      hoverKind: 'point',
      hasPriceSeries: false,
      worldAtIndex: (index) => centers[index] ?? null,
      indexAtWorld: (world) => nearestIndex(centers, world),
    },
    layout ? layout.barWidth : 0,
    layout?.barVisible,
  )
}

/** 多日交易网格可滚动；尺寸与数据分组共同派生，禁止退回单日或 K 线几何。 */
function projectMultipleSessions(input: ViewInput): ViewSnapshot {
  const slotsPerDay = input.marketSession ? resolveMarketSessionSlots(input.marketSession) : 0
  const slots = slotsPerDay * (input.timeShareRange?.days.length ?? 0)
  const width = Math.max(input.width, slots * (input.sessionSlotWidth ?? 1 / input.dpr))
  const grid = createTimeShareSlotGrid(width, slots, input.dpr)
  const layout =
    input.timeShareRange && input.marketSession
      ? computeFiveDayTimeShareGeometry({
          range: input.timeShareRange,
          marketSession: input.marketSession,
          contentWidth: width,
          dpr: input.dpr,
        })
      : null
  const scroll = Math.max(0, Math.min(input.scroll, Math.max(0, width - input.width)))
  const centers = layout ? layout.centers : []
  const kWidthPx = layout ? layout.kWidthPx : 1
  return snapshot(
    input,
    {
      grid,
      scroll,
      domOffset: 0,
      domScroll: scroll,
      contentWidth: width,
      seriesWidth: width,
      kWidth: kWidthPx / input.dpr,
      kGap: 1 / input.dpr,
      kWidthPx,
      range: { start: 0, end: centers.length },
      slotRange: { start: 0, end: slots },
      centers,
      fiveDayGeometry: layout ? layout.geometry : null,
      capabilities: SESSION_CAPABILITIES,
      hoverKind: 'point',
      hasPriceSeries: false,
      worldAtIndex: (index) => centers[index] ?? null,
      indexAtWorld: (world) => nearestIndex(centers, world),
    },
    layout ? layout.barWidth : 0,
    layout?.barVisible,
  )
}

/** K 线缩放只改变配置尺寸，导航由统一锚点变换计算。 */
function zoomBars(input: ViewInput, _delta: number, kWidth: number): ViewInput {
  return { ...input, kWidth }
}

/** 多日分时根据当前网格步长改变交易槽宽。 */
function zoomSessions(input: ViewInput, delta: number, _kWidth: number): ViewInput {
  const before = projectMultipleSessions(input)
  return {
    ...input,
    sessionSlotWidth: Math.max(1, Math.round(before.grid.step * input.dpr) + delta) / input.dpr,
  }
}

/** 无界视图接受任意有限世界坐标。 */
function navigateBars(_snapshot: ViewSnapshot, requested: number): number {
  return requested
}
/** 固定视图拒绝横向导航。 */
function navigateFixed(_snapshot: ViewSnapshot, _requested: number): number {
  return 0
}
/** 多日视图导航限制在其交易内容内。 */
function navigateSessions(view: ViewSnapshot, requested: number): number {
  return Math.max(0, Math.min(requested, Math.max(0, view.contentWidth - view.viewportWidth)))
}

const bars: ViewStrategy = {
  requiresMarketSession: false,
  capabilities: BAR_CAPABILITIES,
  project: projectBars,
  zoomInput: zoomBars,
  navigate: navigateBars,
}
const single: ViewStrategy = {
  requiresMarketSession: true,
  capabilities: FIXED_CAPABILITIES,
  project: projectSingleSession,
  zoomInput: (input) => input,
  navigate: navigateFixed,
}
const multiple: ViewStrategy = {
  requiresMarketSession: true,
  capabilities: SESSION_CAPABILITIES,
  project: projectMultipleSessions,
  zoomInput: zoomSessions,
  navigate: navigateSessions,
}

/** 唯一的视图策略选择点，新增视图必须完整实现同一契约。 */
export const VIEW_STRATEGIES: Readonly<Record<ViewInput['view'], ViewStrategy>> = Object.freeze({
  [ChartDataViewId.KLine]: bars,
  [ChartDataViewId.Comparison]: bars,
  [ChartDataViewId.TimeShare]: single,
  [ChartDataViewId.FiveDayTimeShare]: multiple,
})
