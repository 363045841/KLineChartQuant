/** K 线图表模式：内容宽度/柱宽交给标准缩放，价格范围取可见区 high/low 极值。 */
import type { ChartDataManager } from '../../../data/chartDataManager.js'
import { getVisiblePriceRange, type VisibleRange } from '../../../viewport/viewport.js'
import type {
  ChartModeActivationContext,
  ChartModeChartContext,
  ChartModeHandler,
  PaneAutoPriceRange,
} from './types.js'

export class KLineMode implements ChartModeHandler {
  readonly debugName = 'KLine'

  readonly useIndicatorScheduler = true

  /**
   * 取可见 K 线区间的 max(high)/min(low)，并并入主图指标极值。
   * 无可见真实 bar（纯未来区视口或空数据）时可见区为空，返回 null，渲染端保留上一帧范围。
   */
  computePaneRange(
    range: VisibleRange,
    dm: ChartDataManager,
    mergedIndicatorRange?: { min: number; max: number } | null,
  ): PaneAutoPriceRange | null {
    const data = dm.getInternalData()
    const priceRange = getVisiblePriceRange(data, range.start, range.end)
    if (!priceRange) return null

    if (
      mergedIndicatorRange &&
      Number.isFinite(mergedIndicatorRange.min) &&
      Number.isFinite(mergedIndicatorRange.max)
    ) {
      priceRange.minPrice = Math.min(priceRange.minPrice, mergedIndicatorRange.min)
      priceRange.maxPrice = Math.max(priceRange.maxPrice, mergedIndicatorRange.max)
    }

    return {
      range: priceRange,
      basePrice: data[Math.max(0, range.start)]?.close ?? null,
    }
  }

  onActivate(_chart: ChartModeActivationContext, _prev: ChartModeHandler | null): void {}

  onDeactivate(_chart: ChartModeChartContext, _next: ChartModeHandler | null): void {}
}
