/** 价格轴范围决策：四条自动范围通道 + 唯一的锁定优先选择，供渲染器收集阶段调用。 */
import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../../foundation/config/priceAxisRangeMode.js'
import type { PaneRole } from '../../../foundation/plugin/index.js'
import type { ComparisonProjection } from '../../chartModel/impl/comparison/types.js'
import type { ChartModeHandler, PaneAutoPriceRange } from '../../chartModel/impl/modes/types.js'
import type { ChartDataManager } from '../../data/chartDataManager.js'
import { MAIN_PANE_ID } from '../../pane/types.js'
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
  readonly paneId: string
  readonly role: PaneRole
  readonly range: VisibleRange
  readonly dataManager: ChartDataManager
  readonly mode: ChartModeHandler
  readonly mainIndicatorRange: { min: number; max: number } | null
  readonly comparisonActive: boolean
  readonly comparisonProjection: ComparisonProjection | null
  readonly subIndicatorRange: { min: number; max: number } | null
}

/**
 * 按 Pane 角色与数据视图分派自动范围通道：
 * 副图用指标 state 极值；主图比较叠加用比较投影；其余交给当前图表模式（K 线可见区 / 分时）。
 * @returns 自动范围；无有效数据时返回 null
 */
export function computePaneAutoRange(input: PaneAutoRangeInput): PaneAutoPriceRange | null {
  if (input.role === 'indicator') {
    // 副图坐标轴只由对应指标 state 驱动，与主图模式无关。
    const sub = input.subIndicatorRange
    return sub ? { range: { minPrice: sub.min, maxPrice: sub.max }, basePrice: null } : null
  }

  if (input.paneId === MAIN_PANE_ID && input.comparisonActive && input.comparisonProjection) {
    const { min, max, basePrice } = input.comparisonProjection
    return {
      range: {
        minPrice: Math.min(min, input.mainIndicatorRange?.min ?? min),
        maxPrice: Math.max(max, input.mainIndicatorRange?.max ?? max),
      },
      basePrice,
    }
  }

  const indicatorRange = input.mode.useIndicatorScheduler ? input.mainIndicatorRange : null
  return input.mode.computePaneRange(input.range, input.dataManager, indicatorRange)
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
