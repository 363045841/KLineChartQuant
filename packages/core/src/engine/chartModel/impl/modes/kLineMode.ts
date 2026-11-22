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

  readonly fitsPriceBars = true

  /**
   * 取可见 K 线区间的 max(high)/min(low) 作为价格轴主投影。
   * 无可见真实 bar（纯未来区视口或空数据）时返回 null，渲染端保留上一帧范围。
   *
   * @param range 当前视口可见索引区间
   * @param dm 行情数据管理器
   * @param closeOnly 线形/面积图只取收盘价
   * @returns 主投影范围与基准价；没有可见行情时返回 null
   */
  computePaneRange(
    range: VisibleRange,
    dm: ChartDataManager,
    closeOnly = false,
  ): PaneAutoPriceRange | null {
    const data = dm.getInternalData()
    const priceRange = getVisiblePriceRange(data, range.start, range.end, closeOnly)
    if (!priceRange) return null
    return {
      range: priceRange,
      basePrice: data[Math.max(0, range.start)]?.close ?? null,
    }
  }

  onActivate(_chart: ChartModeActivationContext, _prev: ChartModeHandler | null): void {}

  onDeactivate(_chart: ChartModeChartContext, _next: ChartModeHandler | null): void {}
}
