import {
  ASHARE_MARKET_SESSION,
  resolveMarketSessionSlots,
  type MarketSessionConfig,
} from '../../foundation/utils/timeShareAxisLabels'

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
 * 分时 bar 宽度：按全天 sessionSlots 均分 viewWidth，而非按已到达点数。
 * 盘中部分数据时右侧留白；允许亚像素，避免窄屏截断。
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
  const unit = viewWidth / sessionSlots
  const preferredGap = 1 / dpr
  const kGap = Math.min(preferredGap, unit * 0.2)
  const kWidth = Math.max(unit - kGap, unit * 0.01)
  return { kWidth, kGap: unit - kWidth }
}

export type TimeShareXLayoutInput = {
  arrivedCount: number
  sessionSlots: number
  totalWidth: number
  dpr: number
}

export type TimeShareXLayout = {
  step: number
  centers: number[]
  lefts: number[]
  barWidth: number
  kWidthPx: number
}

/**
 * 分时 X 布局：step = totalWidth / sessionSlots，已到达点按 slot 索引落位，未到时段留白。
 */
export function computeTimeShareXLayout(input: TimeShareXLayoutInput): TimeShareXLayout | null {
  const { arrivedCount, sessionSlots, totalWidth, dpr } = input
  if (arrivedCount <= 0 || sessionSlots <= 0 || totalWidth <= 0 || !(dpr > 0)) return null

  const step = totalWidth / sessionSlots
  const centers: number[] = new Array(arrivedCount)
  const lefts: number[] = new Array(arrivedCount)
  for (let i = 0; i < arrivedCount; i++) {
    centers[i] = Math.round((i + 0.5) * step * dpr) / dpr
    lefts[i] = Math.round(i * step * dpr) / dpr
  }

  const logicalBarWidth = Math.max(step * 0.6, 1 / dpr)
  const barWidthPx = Math.max(1, Math.round(logicalBarWidth * dpr))
  const barWidth = barWidthPx / dpr
  const kWidthPx = Math.max(1, Math.round(step * dpr))

  return { step, centers, lefts, barWidth, kWidthPx }
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
