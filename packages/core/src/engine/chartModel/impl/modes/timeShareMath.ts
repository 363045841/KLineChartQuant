/** 分时几何与价格轴计算的纯函数集合。 */
import { resolveSessionSlotPhysicalGrid } from '@/foundation/utils/timeShareAxisLabels.js'
import { calcKBarWidthPx } from '../../../viewport/klineConfig.js'

/**
 * 昨收基准只接受正的有限数；无效值统一返回 null。
 * 五日视图由数据层直接提供第一交易日昨收，这里不再区分视图。
 */
export function resolveTimeShareBaseline(preClose: number | null | undefined): number | null {
  if (typeof preClose !== 'number' || !Number.isFinite(preClose) || preClose <= 0) return null
  return preClose
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

export type TimeShareXLayoutInput = {
  arrivedCount: number
  sessionSlots: number
  totalWidth: number
  dpr: number
  /** 每个点所在的全局槽位；null 表示时间戳无法解析，不能参与绘制。 */
  slotIndices?: ReadonlyArray<number | null>
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
 * 无槽位的点沿用前一有效落点，只为维持数据索引对齐，不参与绘制。
 */
export function computeTimeShareXLayout(input: TimeShareXLayoutInput): TimeShareXLayout | null {
  const { arrivedCount, sessionSlots, totalWidth, dpr, slotIndices } = input
  if (arrivedCount <= 0 || sessionSlots <= 0 || totalWidth <= 0 || !(dpr > 0)) return null

  const grid = resolveSessionSlotPhysicalGrid(totalWidth, sessionSlots, dpr)
  const step = grid ? grid.unitPx / dpr : totalWidth / sessionSlots
  const centers: number[] = new Array(arrivedCount)
  const centerPxValues: Array<number | null> = new Array(arrivedCount)
  const lastIndexByCenterPx = new Map<number, number>()
  let previousCenter = 0
  for (let i = 0; i < arrivedCount; i++) {
    const slotIndex = slotIndices?.[i]
    if (slotIndex === null) {
      centers[i] = previousCenter
      centerPxValues[i] = null
      continue
    }
    const resolvedSlot = slotIndex === undefined ? i : slotIndex
    const centerPx = grid
      ? grid.offsetPx + resolvedSlot * grid.unitPx + Math.floor(grid.unitPx / 2)
      : Math.round((resolvedSlot + 0.5) * step * dpr)
    centerPxValues[i] = centerPx
    centers[i] = centerPx / dpr
    previousCenter = centers[i]!
    lastIndexByCenterPx.set(centerPx, i)
  }

  const barVisible = centerPxValues.map(
    (centerPx, index) => centerPx !== null && lastIndexByCenterPx.get(centerPx) === index,
  )
  const kWidthPx = grid?.unitPx ?? 1
  const barWidth = calcKBarWidthPx(kWidthPx) / dpr

  return { step, offset: (grid?.offsetPx ?? 0) / dpr, centers, barWidth, barVisible, kWidthPx }
}

export { computeTimeShareTimeLabelIndices } from '@/foundation/utils/timeShareAxisLabels.js'
