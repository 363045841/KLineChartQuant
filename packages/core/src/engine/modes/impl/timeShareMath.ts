/** 分时几何与价格轴计算的纯函数集合。 */
import type { TimeShareRange } from '@/data/provider/types.js'
import {
  ASHARE_MARKET_SESSION,
  type MarketSessionConfig,
  resolveMarketSessionSlots,
  resolveSessionSlotPhysicalGrid,
} from '@/foundation/utils/timeShareAxisLabels.js'
import { calcKBarWidthPx } from '../../utils/klineConfig.js'

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

/** 五日分时全窗口固定使用第一交易日的昨收作为基准。 */
export function resolveFiveDayTimeShareBaseline(
  range: TimeShareRange | null | undefined,
): number | null {
  return resolveTimeShareBaseline({ preClose: range?.days[0]?.preClose })
}

export type TimeSharePriceRange = {
  minPrice: number
  maxPrice: number
}

// 非平盘按可见振幅留白，平盘按价格量级保留非零区间。
const TIME_SHARE_RANGE_PADDING_RATIO = 0.1
const TIME_SHARE_FLAT_PADDING_RATIO = 0.0001

/** 从可见价格与均价的极值生成带留白的 Y 轴范围；无有效值时返回 null。 */
export function computeTimeSharePriceRange(
  prices: ReadonlyArray<number | undefined | null>,
): TimeSharePriceRange | null {
  let minPrice = Infinity
  let maxPrice = -Infinity
  for (const price of prices) {
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    minPrice = Math.min(minPrice, price)
    maxPrice = Math.max(maxPrice, price)
  }
  if (!Number.isFinite(minPrice)) return null

  const span = maxPrice - minPrice
  // 最小区间只用于完全平盘，不能扩大已有的小幅波动。
  const padding =
    span > 0
      ? span * TIME_SHARE_RANGE_PADDING_RATIO
      : (Math.abs(minPrice) || 1) * TIME_SHARE_FLAT_PADDING_RATIO
  return {
    minPrice: minPrice - padding,
    maxPrice: maxPrice + padding,
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

export {
  computeTimeShareTimeLabelIndices,
  TIMESHARE_MIN_LABEL_SPACING_PX,
  type TimeShareTimeLabelInput,
} from '@/foundation/utils/timeShareAxisLabels.js'
