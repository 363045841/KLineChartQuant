/** 集中定义各视图的横向行为；模型、绘制和交互不再独立识别周期。 */
import { slotIndexAt, slotWorldX } from '../../../foundation/geometry/slotGrid.js'
import { ChartDataViewId } from '../../../foundation/types/chartView.js'
import {
  resolveMarketSessionSlots,
  resolveTimestampSessionSlot,
} from '../../../foundation/utils/timeShareAxisLabels.js'
import { CHART_VIEW_DEFINITIONS } from '../../chartModel/index.js'
import { computeFiveDayTimeShareGeometry, computeTimeShareXLayout } from '../../chartModel/index.js'
import { calcKBarWidthPx, calcKWidthPx } from '../../utils/klineConfig.js'
import { kGapFromKWidth } from '../../utils/zoom.js'
import { createKLineSlotGrid, createTimeShareSlotGrid } from '../../viewport/slotGrid.js'
import type { ViewInput, ViewSnapshot, ViewStrategy } from '../types.js'

/** 视图能力与市场 session 需求统一来自 ChartModel 声明。 */
const KLINE_DEFINITION = CHART_VIEW_DEFINITIONS[ChartDataViewId.KLine]
const TIMESHARE_DEFINITION = CHART_VIEW_DEFINITIONS[ChartDataViewId.TimeShare]
const FIVE_DAY_DEFINITION = CHART_VIEW_DEFINITIONS[ChartDataViewId.FiveDayTimeShare]

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
    // K 线几何不依赖到达点数量；交易视图必须有可绘制的交易中心。
    ready: input.width > 0 && (fields.hoverKind === 'candle' ? true : fields.centers.length > 0),
    positions: fields.centers.map((center) => center - half),
    bars: fields.centers.map((center, index) => ({
      x: center - (Math.round(barWidth * input.dpr) - 1) / (2 * input.dpr),
      width: visible && !visible[index] ? 0 : barWidth,
    })),
  }
}

/** K 线与对比槽位共用网格，视口边界保留至少两根完整实体。 */
function projectBars(input: ViewInput): ViewSnapshot {
  const gap = kGapFromKWidth(input.kWidth, input.dpr)
  const grid = createKLineSlotGrid(input.kWidth, gap, input.dpr)
  const barWidth = calcKBarWidthPx(grid.step * input.dpr) / input.dpr
  const half = (Math.round(barWidth * input.dpr) - 1) / (2 * input.dpr)
  const count = Math.min(2, input.dataLength)
  const min =
    count > 0 ? Math.max(-input.width, slotWorldX(grid, count - 1) + half - input.width) : 0
  const max = count > 0 ? slotWorldX(grid, input.dataLength - count) - half : 0
  // 视口窄于两根实体时居中显示已有数据；正常尺寸严格保留两根完整实体。
  const scrollBounds = min <= max ? { min, max } : { min: (min + max) / 2, max: (min + max) / 2 }
  const scroll = Math.max(scrollBounds.min, Math.min(input.scroll, scrollBounds.max))
  const start = Math.floor((scroll - grid.origin) / grid.step) - 1
  const end = Math.ceil((scroll + input.width - grid.origin) / grid.step) + 1
  const range = { start: Math.max(0, start), end: Math.max(0, end) }
  const baseOffset = Math.round(input.width)
  const domOffset = baseOffset
  const domScroll = scroll + domOffset
  const seriesWidth = input.dataLength * grid.step
  const kWidthPx = calcKWidthPx(input.kWidth, input.dpr)
  return snapshot(
    input,
    {
      grid,
      scroll,
      scrollBounds,
      domOffset,
      domScroll,
      // 两侧各预留一屏；实际导航还必须满足最少可见 K 线约束。
      contentWidth: domOffset + seriesWidth + input.width,
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
      capabilities: KLINE_DEFINITION.capabilities,
      hoverKind: 'candle',
      hasPriceSeries: true,
      worldAtIndex: (index) => (Number.isInteger(index) ? slotWorldX(grid, index) : null),
      indexAtWorld: (world) => (Number.isFinite(world) ? slotIndexAt(grid, world) : null),
    },
    barWidth,
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
      scrollBounds: { min: 0, max: 0 },
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
      capabilities: TIMESHARE_DEFINITION.capabilities,
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
      scrollBounds: { min: 0, max: Math.max(0, width - input.width) },
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
      capabilities: FIVE_DAY_DEFINITION.capabilities,
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

/** 平移与缩放统一遵循当前投影的可见数据边界。 */
function navigateBars(view: ViewSnapshot, requested: number): number {
  return Math.max(view.scrollBounds.min, Math.min(requested, view.scrollBounds.max))
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
  requiresMarketSession: KLINE_DEFINITION.requiresMarketSession,
  capabilities: KLINE_DEFINITION.capabilities,
  project: projectBars,
  zoomInput: zoomBars,
  navigate: navigateBars,
}
const single: ViewStrategy = {
  requiresMarketSession: TIMESHARE_DEFINITION.requiresMarketSession,
  capabilities: TIMESHARE_DEFINITION.capabilities,
  project: projectSingleSession,
  zoomInput: (input) => input,
  navigate: navigateFixed,
}
const multiple: ViewStrategy = {
  requiresMarketSession: FIVE_DAY_DEFINITION.requiresMarketSession,
  capabilities: FIVE_DAY_DEFINITION.capabilities,
  project: projectMultipleSessions,
  zoomInput: zoomSessions,
  navigate: navigateSessions,
}

/** 唯一的视图策略选择点，新增视图必须完整实现同一契约。 */
export const VIEW_STRATEGIES: Readonly<Record<ViewInput['view'], ViewStrategy>> = Object.freeze({
  [ChartDataViewId.KLine]: bars,
  [ChartDataViewId.TimeShare]: single,
  [ChartDataViewId.FiveDayTimeShare]: multiple,
})
