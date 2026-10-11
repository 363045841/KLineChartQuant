/** 图表模式契约：K 线/分时等模式对内容宽度、柱宽与价格范围的统一接口。 */

import type { ChartDataManager } from '../../../data/chartDataManager.js'
import type { PriceRange } from '../../../scale/index.js'
import type { VisibleRange } from '../../../viewport/viewport.js'

/** 收集阶段由模式算出的自动价格范围及其百分比基准价。 */
export interface PaneAutoPriceRange {
  readonly range: PriceRange
  readonly basePrice: number | null
}

/** 模式激活/停用时，图表暴露给模式的能力入口。 */
export interface ChartModeChartContext {
  enableMainIndicator: (
    id: string,
    params?: Record<string, number | boolean | string>,
  ) => boolean
  disableMainIndicator: (id: string) => boolean
  dataManager: ChartDataManager
}

/** 激活上下文：在能力入口之上附带当前主品种周期。 */
export interface ChartModeActivationContext extends ChartModeChartContext {
  currentPeriod: string
}

export interface ChartModeHandler {
  readonly debugName: string

  /** 是否使用指标调度器（计算 MA/BOLL 等技术指标） */
  readonly useIndicatorScheduler: boolean

  /**
   * 收集阶段计算当前可见数据的自动价格范围，不修改任何 Pane。
   * @param range 当前视口可见索引区间
   * @param dm 行情数据管理器
   * @param mergedIndicatorRange 需要并入的主图指标极值
   * @returns 自动范围；无有效价格数据时返回 null
   */
  computePaneRange(
    range: VisibleRange,
    dm: ChartDataManager,
    mergedIndicatorRange?: { min: number; max: number } | null,
  ): PaneAutoPriceRange | null

  /** 激活时调用 */
  onActivate(chart: ChartModeActivationContext, prev: ChartModeHandler | null): void

  /** 停用时调用 */
  onDeactivate(chart: ChartModeChartContext, next: ChartModeHandler | null): void
}
