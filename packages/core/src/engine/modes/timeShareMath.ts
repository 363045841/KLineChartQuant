import {
  ASHARE_MARKET_SESSION,
  resolveMarketSessionSlots,
  resolveSessionSlotPhysicalGrid,
  type MarketSessionConfig,
} from '../../foundation/utils/timeShareAxisLabels'
import { calcKBarWidthPx } from '../utils/klineConfig'

export type TimeShareBaselineInput = {
  preClose?: number | null
  firstPrice?: number | null
}

export function resolveTimeShareBaseline(input: TimeShareBaselineInput): number | null {
  const candidates = [input.preClose]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return v
  }
  return null
}

export type TimeSharePriceRange = {
  minPrice: number
  maxPrice: number
}

/**
 * 分时 Y 轴价格区间：以 baseline（昨收）为中心，对称覆盖可见最大绝对涨跌幅并加 padding。
 * 全天平盘时仍保留最小 0.5% 边距，避免 range 退化。
 */
export function computeTimeSharePriceRange(
  prices: ReadonlyArray<number | undefined | null>,
  baseline: number,
): TimeSharePriceRange | null {
  if (!Number.isFinite(baseline) || baseline === 0) return null

  let maxAbsPct = 0
  for (const p of prices) {
    if (typeof p !== 'number' || !Number.isFinite(p)) continue
    const pct = Math.abs((p - baseline) / baseline) * 100
    if (pct > maxAbsPct) maxAbsPct = pct
  }

  const padding = Math.max(maxAbsPct * 0.1, 0.5)
  const displayPct = maxAbsPct + padding
  return {
    minPrice: baseline * (1 - displayPct / 100),
    maxPrice: baseline * (1 + displayPct / 100),
  }
}

/** A 股默认全天 1 分钟槽位数（兼容旧导出） */
export const ASHARE_TIMESHARE_SESSION_SLOTS = resolveMarketSessionSlots(ASHARE_MARKET_SESSION)

/**
 * 全天交易槽位数：以 marketSession 为 SSOT，不因 arrivedCount 放大。
 * @deprecated 优先用 resolveMarketSessionSlots(config)
 */
export function resolveTimeShareSessionSlots(
  arrivedCount: number,
  marketSession: MarketSessionConfig = ASHARE_MARKET_SESSION,
): number {
  void arrivedCount
  return resolveMarketSessionSlots(marketSession)
}

/**
 * 分时 bar 宽度：使用可容纳全部 sessionSlots 的固定整数物理网格。
 * 多余像素均分到左右边距；物理宽度不足时回退比例布局。
 */
export function computeTimeShareBarMetrics(
  dataLength: number,
  viewWidth: number,
  dpr: number,
  marketSession: MarketSessionConfig = ASHARE_MARKET_SESSION,
): { kWidth: number; kGap: number } | null {
  if (dataLength <= 0 || viewWidth <= 0 || !(dpr > 0)) return null

  const sessionSlots = resolveMarketSessionSlots(marketSession)
  if (sessionSlots <= 0) return null
  const grid = resolveSessionSlotPhysicalGrid(viewWidth, sessionSlots, dpr)
  if (!grid) {
    const unit = viewWidth / sessionSlots
    const kWidth = Math.max(unit - 1 / dpr, unit * 0.01)
    return { kWidth, kGap: unit - kWidth }
  }
  const barWidthPx = calcKBarWidthPx(grid.unitPx)
  return { kWidth: barWidthPx / dpr, kGap: (grid.unitPx - barWidthPx) / dpr }
}

export type TimeShareXLayoutInput = {
  arrivedCount: number
  sessionSlots: number
  totalWidth: number
  dpr: number
  slotIndices?: ReadonlyArray<number>
}

export type TimeShareXLayout = {
  step: number
  /** 第一个槽位网格的逻辑像素起点。 */
  offset: number
  centers: number[]
  barWidth: number
  /** 同一物理中心的端点重复数据仅保留最后一根量柱。 */
  barVisible: boolean[]
  kWidthPx: number
}

/**
 * 分时 X 布局：优先使用固定整数物理间距，已到达点按 slot 索引落位。
 */
export function computeTimeShareXLayout(input: TimeShareXLayoutInput): TimeShareXLayout | null {
  const { arrivedCount, sessionSlots, totalWidth, dpr, slotIndices } = input
  if (arrivedCount <= 0 || sessionSlots <= 0 || totalWidth <= 0 || !(dpr > 0)) return null

  const grid = resolveSessionSlotPhysicalGrid(totalWidth, sessionSlots, dpr)
  const step = grid ? grid.unitPx / dpr : totalWidth / sessionSlots
  const centers: number[] = new Array(arrivedCount)
  const centerPxValues: number[] = new Array(arrivedCount)
  const lastIndexByCenterPx = new Map<number, number>()
  for (let i = 0; i < arrivedCount; i++) {
    const slotIndex = slotIndices?.[i] ?? i
    const centerPx = grid
      ? grid.offsetPx + slotIndex * grid.unitPx + Math.floor(grid.unitPx / 2)
      : Math.round((slotIndex + 0.5) * step * dpr)
    centerPxValues[i] = centerPx
    centers[i] = centerPx / dpr
    lastIndexByCenterPx.set(centerPx, i)
  }

  const barVisible = centerPxValues.map(
    (centerPx, index) => lastIndexByCenterPx.get(centerPx) === index,
  )
  const kWidthPx = grid?.unitPx ?? 1
  const barWidth = calcKBarWidthPx(kWidthPx) / dpr

  return { step, offset: (grid?.offsetPx ?? 0) / dpr, centers, barWidth, barVisible, kWidthPx }
}

export type TimeShareVisibleRangeInput = {
  scrollLeft: number
  totalWidth: number
  dataLength: number
  sessionSlots: number
}

/**
 * 分时可见区间：与 computeTimeShareXLayout 共用同一套 slot 网格（step = totalWidth / sessionSlots）。
 *
 * 不能复用 getVisibleRange（K 线按 kWidth/kGap 取整的网格）：分时落点按 step 均分，
 * 两者取整误差会累积，导致窄屏时右侧数据被排除在渲染范围之外。
 * 分时无平移/缩放（scrollLeft 恒为 0），此函数结果恒为 [-1, dataLength]。
 */
export function computeTimeShareVisibleRange(input: TimeShareVisibleRangeInput): {
  start: number
  end: number
} {
  const { scrollLeft, totalWidth, dataLength, sessionSlots } = input
  if (dataLength <= 0 || sessionSlots <= 0 || totalWidth <= 0) return { start: 0, end: 0 }
  const step = totalWidth / sessionSlots
  const start = Math.floor(scrollLeft / step) - 1
  const end = Math.min(dataLength, Math.ceil((scrollLeft + totalWidth) / step) + 1)
  return { start, end }
}

export type TimeSharePaneLayout = {
  priceTop: number
  priceAreaHeight: number
  volumeTop: number
  volumeAreaHeight: number
}

export function computeTimeSharePaneLayout(
  paneHeight: number,
  volumeRatio: number,
): TimeSharePaneLayout {
  const ratio = Math.min(1, Math.max(0, volumeRatio))
  const volumeAreaHeight = paneHeight * ratio
  const priceAreaHeight = paneHeight - volumeAreaHeight
  return {
    priceTop: 0,
    priceAreaHeight,
    volumeTop: priceAreaHeight,
    volumeAreaHeight,
  }
}

export {
  TIMESHARE_MIN_LABEL_SPACING_PX,
  computeTimeShareTimeLabelIndices,
  type TimeShareTimeLabelInput,
} from '../../foundation/utils/timeShareAxisLabels'
