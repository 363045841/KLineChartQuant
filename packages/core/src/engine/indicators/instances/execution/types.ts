/** 单任务执行端口：版本、合并与发布由调度器管理，执行器只管理定义和计算器。 */
import type { KLineData } from '@/foundation/types/price.js'
import type {
  IndicatorCalculationOutput,
  IndicatorCalculationSource,
  IndicatorCalculationTask,
} from '../domain/instanceCalculationPlan.js'
import type { IndicatorResultPool } from '../domain/instanceModel.js'

export interface IndicatorCalculationExecutor {
  readonly revision: number
  retain(tasks: readonly IndicatorCalculationTask[]): void
  execute(
    task: IndicatorCalculationTask,
    data: readonly KLineData[],
    signal: AbortSignal,
  ): Promise<IndicatorCalculationOutput>
}

export interface IndicatorCalculationInput {
  readonly dataRevision: number
  readonly timestamps: readonly number[]
  readonly data: readonly KLineData[]
}

export interface InstanceCalculationCommit {
  readonly requestId: number
  readonly pool: IndicatorResultPool
}
export interface CreateInstanceCalculationSchedulerOptions {
  readonly pipeline: IndicatorCalculationSource
  readonly executor: IndicatorCalculationExecutor
  readonly onCommit: (commit: InstanceCalculationCommit) => void
  readonly onError?: (error: unknown) => void
  readonly onPending?: (instanceIds: readonly string[], pending: boolean) => void
}
