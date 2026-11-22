/** 价格轴范围决策：自动口径取数 + 手动范围的唯一裁决点。 */
import {
  type AutoPriceAxisRangeMode,
  PRICE_AXIS_RANGE_MODE,
  PRICE_AXIS_RATIO_SHARE,
  type PriceAxisRangeMode,
} from '../../../foundation/config/priceAxisRangeMode.js'
import type { PriceRange } from '../../scale/index.js'

/** 单条轴本帧最终采用的价格范围、基准价与手动范围初始化标记。 */
export interface ResolvedPanePriceRange {
  /** 本帧应投影到运行时轴的范围；null 表示无有效范围，保留上一帧。 */
  readonly range: PriceRange | null
  /** 百分比轴基准价。 */
  readonly basePrice: number | null
  /** 手动模式尚未保存范围时，本帧自动范围需要回填为手动值。 */
  readonly initializeRange: boolean
}

/** 单条轴的范围来源：基准由模式算出，其余来源按口径决定是否参与。 */
export interface PaneRangeSourceInput {
  readonly rangeMode: PriceAxisRangeMode
  /** 本轴承载行情价格序列（主价格轴）。`bars` / `ratio` 只对它开放。 */
  readonly isPriceSeries: boolean
  /** 当前模式是否用指标调度器；分时等模式不并入指标输出。 */
  readonly useIndicatorScheduler: boolean
  /** 比较投影是否已接管基准；此时足迹不再叠加。 */
  readonly comparisonActive: boolean
  readonly indicatorRange: { readonly min: number; readonly max: number } | null
  readonly footprintRange: PriceRange | null
  readonly drawingRange: PriceRange | null
}

/**
 * 基准之外的可见来源。
 *
 * 只有全并口径需要这些来源；手动模式没有自己的取数口径，初始化同样按全并求一次。
 *
 * @param input 本轴的口径与各来源范围
 * @returns 需要并入轴范围的来源；按口径不需要时为空
 */
export function collectRangeContributions(input: PaneRangeSourceInput): readonly PriceRange[] {
  if (resolveCollectionMode(input.rangeMode) !== PRICE_AXIS_RANGE_MODE.All) return []
  const contributions: PriceRange[] = []
  if (input.isPriceSeries && input.useIndicatorScheduler && input.indicatorRange)
    contributions.push({ minPrice: input.indicatorRange.min, maxPrice: input.indicatorRange.max })
  // 足迹只在价格轴叠加；比较激活时基准换成比较投影，两品种已对齐到同一量纲。
  if (input.isPriceSeries && !input.comparisonActive && input.footprintRange)
    contributions.push(input.footprintRange)
  if (input.drawingRange) contributions.push(input.drawingRange)
  return contributions
}

/** 手动模式没有自己的取数口径，取数与初始化都按全并口径。 */
function resolveCollectionMode(rangeMode: PriceAxisRangeMode): AutoPriceAxisRangeMode {
  return rangeMode === PRICE_AXIS_RANGE_MODE.Manual ? PRICE_AXIS_RANGE_MODE.All : rangeMode
}

/** 自动范围输入：基准加按口径筛过的来源。 */
interface PaneAutoRangeInput {
  readonly rangeMode: PriceAxisRangeMode
  /** 本轴的主投影：价格轴是可见行情（比较激活时为比较投影），指标轴是自身极值。 */
  readonly basis: PriceRange | null
  readonly contributions: readonly PriceRange[]
}

/**
 * 按口径求自动范围。
 *
 * `all` 取全部来源并集，`bars` 只取基准，`ratio` 把基准按固定占比向上下留白；
 * 手动模式没有取数口径，初始化按全并口径求一次。
 *
 * @param input 口径、基准与已筛过的来源
 * @returns 自动范围；没有任何有效来源时返回 null
 */
export function computeAutoRange(input: PaneAutoRangeInput): PriceRange | null {
  const mode = resolveCollectionMode(input.rangeMode)
  // 没有基准的轴只能按自身来源定轴，口径不改变这一点。
  if (input.basis === null) return unionRanges(input.contributions)
  if (mode === PRICE_AXIS_RANGE_MODE.All) return unionRanges([input.basis, ...input.contributions])
  if (mode === PRICE_AXIS_RANGE_MODE.Bars) return input.basis
  return expandByRatio(input.basis, PRICE_AXIS_RATIO_SHARE)
}

/** 取范围并集；空集合返回 null。 */
function unionRanges(ranges: readonly PriceRange[]): PriceRange | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const range of ranges) {
    min = Math.min(min, range.minPrice)
    max = Math.max(max, range.maxPrice)
  }
  return min <= max ? { minPrice: min, maxPrice: max } : null
}

/**
 * 固定 K 线占比：基准向上下对称扩展，使基准占窗口高度的 `share`。
 * 振幅为 0（平盘）时没有可比距离，范围保持基准本身。
 */
function expandByRatio(range: PriceRange, share: number): PriceRange {
  const span = range.maxPrice - range.minPrice
  if (!(span > 0)) return range
  const padding = (span * (1 - share)) / (2 * share)
  return { minPrice: range.minPrice - padding, maxPrice: range.maxPrice + padding }
}

/**
 * 唯一的范围决策点：自动口径直接采用本帧结果；手动模式保留已保存范围，
 * 尚未保存时用本帧结果回填一次。
 *
 * @param input 口径、已保存范围、本帧自动范围与基准价
 * @returns 本帧应投影的范围、基准价与回填标记
 */
export function resolvePanePriceRange(input: {
  readonly rangeMode: PriceAxisRangeMode
  readonly currentRange: PriceRange | null
  readonly autoRange: PriceRange | null
  readonly basePrice: number | null
}): ResolvedPanePriceRange {
  const manual = input.rangeMode === PRICE_AXIS_RANGE_MODE.Manual
  if (manual && input.currentRange !== null)
    return { range: input.currentRange, basePrice: input.basePrice, initializeRange: false }
  return {
    range: input.autoRange,
    basePrice: input.basePrice,
    initializeRange: manual && input.autoRange !== null,
  }
}
