/** 分时图表模式：固定整物理网格柱宽，自动价格范围覆盖可见行情与昨收。 */
import type { ChartDataManager } from '../../../data/chartDataManager.js'
import type { VisibleRange } from '../../../viewport/viewport.js'
import { computeTimeSharePriceRange, resolveTimeShareBaseline } from './timeShareMath.js'
import type {
  ChartModeActivationContext,
  ChartModeChartContext,
  ChartModeHandler,
  PaneAutoPriceRange,
} from './types.js'

export class TimeShareMode implements ChartModeHandler {
  readonly debugName = 'TimeShare'

  readonly useIndicatorScheduler = false

  readonly fitsPriceBars = false

  /**
   * 可见 price/average 与昨收共同生成带留白范围，百分比轴与基准线共用同一个昨收。
   * 昨收缺失时仅按行情拟合，不补造基准价。
   *
   * @param range 当前视口可见索引区间
   * @param dm 行情数据管理器
   * @returns 主投影范围与百分比基准；没有分时数据时返回 null
   */
  computePaneRange(range: VisibleRange, dm: ChartDataManager): PaneAutoPriceRange | null {
    const tsData = dm.getTimeShareData()
    if (tsData.length === 0) return null

    const end = Math.min(range.end, tsData.length)
    const start = Math.max(0, range.start)
    const visibleValues: number[] = []
    for (let i = start; i < end; i++) {
      const item = tsData[i]
      if (!item) continue
      visibleValues.push(item.price, item.average)
    }
    const baseline = resolveTimeShareBaseline(dm.getTimeSharePreClose())
    const priceRange = computeTimeSharePriceRange(visibleValues, baseline)
    if (!priceRange) return null
    return {
      range: priceRange,
      basePrice: baseline,
    }
  }

  onActivate(_chart: ChartModeActivationContext, _prev: ChartModeHandler | null): void {
    // 分时主序列实例与分时布局由 ChartStateKernel.setDataView 原子激活。
  }

  onDeactivate(_chart: ChartModeChartContext, _next: ChartModeHandler | null): void {
    // 离开分时由 ChartStateKernel.setDataView 切换回 K 线工作区，分时实例与布局原样保留。
  }
}
