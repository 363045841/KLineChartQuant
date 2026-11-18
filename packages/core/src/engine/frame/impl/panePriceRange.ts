/** 价格轴范围决策：四条自动范围通道 + 唯一的锁定优先选择，供渲染器收集阶段调用。 */
import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../../foundation/config/priceAxisRangeMode.js'
import type { ComparisonProjection } from '../../chartModel/impl/comparison/types.js'
import type { ChartModeHandler, PaneAutoPriceRange } from '../../chartModel/impl/modes/types.js'
import type { ChartDataManager } from '../../data/chartDataManager.js'
import type { PriceRange } from '../../scale/index.js'
import type { VisibleRange } from '../../viewport/viewport.js'

/** 单个 Pane 本帧最终采用的价格轴范围、基准价与锁定初始化标记。 */
export interface ResolvedPanePriceRange {
  /** 本帧应投影到运行时轴的范围；null 表示无有效范围，保留上一帧。 */
  readonly range: PriceRange | null
  /** 百分比轴基准价。 */
  readonly basePrice: number | null
  /** 锁定模式尚未保存范围时，本帧自动范围需要回填为锁定值。 */
  readonly initializeHandRange: boolean
}

/** 四条自动范围通道的输入；各通道的取数由调用方准备。 */
export interface PaneAutoRangeInput {
  /** 本 Pane 是否承载主价格序列（K 线等），与 Pane 身份无关。 */
  readonly hasPriceSeries: boolean
  readonly range: VisibleRange
  readonly dataManager: ChartDataManager
  readonly mode: ChartModeHandler
  /** 本 Pane 主轴的指标输出极值。 */
  readonly indicatorRange: { min: number; max: number } | null
  readonly comparisonActive: boolean
  readonly comparisonProjection: ComparisonProjection | null
  readonly closeOnly?: boolean
}

/**
 * 按 Pane 内容分派自动范围通道：
 * 有主价格序列时走行情范围并与指标极值合并；只有指标时用指标极值。
 * @returns 自动范围；无有效数据时返回 null
 */
export function computePaneAutoRange(input: PaneAutoRangeInput): PaneAutoPriceRange | null {
  if (!input.hasPriceSeries) {
    const indicator = input.indicatorRange
    return indicator
      ? { range: { minPrice: indicator.min, maxPrice: indicator.max }, basePrice: null }
      : null
  }

  if (input.comparisonActive && input.comparisonProjection) {
    const { min, max, basePrice } = input.comparisonProjection
    return {
      range: {
        minPrice: Math.min(min, input.indicatorRange?.min ?? min),
        maxPrice: Math.max(max, input.indicatorRange?.max ?? max),
      },
      basePrice,
    }
  }

  const indicatorRange = input.mode.useIndicatorScheduler ? input.indicatorRange : null
  return input.mode.computePaneRange(
    input.range,
    input.dataManager,
    indicatorRange,
    input.closeOnly,
  )
}

/**
 * 唯一的范围决策点：锁定模式已保存范围时直接采用，否则用自动范围。
 * 锁定模式尚未保存范围时，标记用本帧自动范围回填。
 */
export function resolvePanePriceRange(input: {
  rangeMode: PriceAxisRangeMode
  handRange: PriceRange | null
  autoRange: PriceRange | null
  basePrice: number | null
}): ResolvedPanePriceRange {
  const locked = input.rangeMode === PRICE_AXIS_RANGE_MODE.HAND
  if (locked && input.handRange) {
    return { range: input.handRange, basePrice: input.basePrice, initializeHandRange: false }
  }
  return {
    range: input.autoRange,
    basePrice: input.basePrice,
    initializeHandRange: locked && input.autoRange !== null,
  }
}
