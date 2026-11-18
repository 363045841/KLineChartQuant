/**
 * ChartIndicatorFacade —— 指标实例的只读查询面。
 *
 * 所有写操作统一走 Chart.panes 的实例命令，这里不再提供第二套写入口。
 */
import type { Computed } from '../../../../foundation/reactivity/signal.js'
import type { IndicatorInstance, SubPaneInfo } from '../../../chart/index.js'
import type { ChartIndicatorManager } from '../../../indicators/chartIndicatorManager.js'

/** Indicator Facade 所需依赖。 */
export interface ChartIndicatorFacadeDependencies {
  manager: ChartIndicatorManager
}

/** 提供指标实例的只读查询。 */
export class ChartIndicatorFacade {
  constructor(private readonly deps: ChartIndicatorFacadeDependencies) {}

  /** 返回全部指标实例的派生信号。 */
  get instances(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this.deps.manager.indicatorsComputed
  }

  /** 返回副图指标信息的派生信号。 */
  get subPanes(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this.deps.manager.subPanesComputed
  }
}
