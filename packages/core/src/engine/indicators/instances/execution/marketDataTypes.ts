/** 图表级行情依赖入口；任务生命周期与现有指标计算计划一致。 */
import type { IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'

export interface IndicatorMarketData {
  readonly revision: number
  context(owner: string, bars: readonly KLineData[]): IndicatorMarketContext
  retain(owners: ReadonlySet<string>): void
}
