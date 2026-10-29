/** 图表级行情依赖入口；任务生命周期与现有指标计算计划一致。 */
import type { IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'

export interface IndicatorMarketData {
  readonly revision: number
  context(owner: string, bars: readonly KLineData[]): IndicatorMarketContext
  /** 提交当前计划的全部租约；只回收计划自己拥有、本次未声明的 key。 */
  retain(owners: ReadonlySet<string>): void
}
