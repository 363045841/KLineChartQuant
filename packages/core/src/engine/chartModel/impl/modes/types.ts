import type { ChartDataManager } from '../../../data/chartDataManager.js'
import type { PriceRange } from '../../../scale/index.js'
import type { VisibleRange } from '../../../viewport/viewport.js'

export interface PaneAutoPriceRange {
  readonly range: PriceRange
  readonly basePrice: number | null
}

/** 视图模式只提供绘制能力和自动价格范围。 */
export interface ChartModeHandler {
  readonly debugName: string
  readonly useIndicatorScheduler: boolean
  readonly fitsPriceBars: boolean
  computePaneRange(
    range: VisibleRange,
    data: ChartDataManager,
    closeOnly?: boolean,
  ): PaneAutoPriceRange | null
}
