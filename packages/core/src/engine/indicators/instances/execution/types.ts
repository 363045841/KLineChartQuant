/** 指标计算执行层的公开契约：行情快照、执行器、结果仓库与调度器。 */
import type { ComputeChange } from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'
import type {
  CalculationPlan,
  CalculationPlanSource,
  CalculationTask,
  IndicatorSeriesOutput,
} from '../domain/calculationPlan.js'
import type {
  CalculationKey,
  IndicatorResult,
  IndicatorSeriesPool,
} from '../domain/indicatorModel.js'

/** 一次计算看到的行情；修订号是结果是否有效的唯一判据。 */
export interface MarketSnapshot {
  readonly dataRevision: number
  /** 行情源（含 request.* 结果）的修订号。 */
  readonly marketRevision: number
  readonly timestamps: readonly number[]
  readonly data: readonly KLineData[]
  /** 本次行情的变化区间；执行器据此推导重算范围。 */
  readonly change: ComputeChange
}

/** 单任务执行端口；只管理定义与计算器，不管理调度、合并或发布。 */
export interface IndicatorCalculationExecutor {
  /** 活动计划拥有计算器与行情租约。 */
  retain(tasks: readonly CalculationTask[]): void
  execute(
    task: CalculationTask,
    snapshot: MarketSnapshot,
    signal: AbortSignal,
  ): Promise<IndicatorSeriesOutput>
}

/** 计算结果仓库：按计算身份保存已提交结果，是读取的唯一事实来源。 */
export interface IndicatorResultStore {
  publish(output: IndicatorSeriesOutput, snapshot: MarketSnapshot): void
  get(key: CalculationKey): IndicatorResult | undefined
  /** 只保留给定身份的结果；图表计划与预览身份由调度器一并提交。 */
  retain(keys: ReadonlySet<CalculationKey>): void
  /** 按当前计划展开为按实例索引的结果池。 */
  snapshot(plan: CalculationPlan, snapshot: MarketSnapshot): IndicatorSeriesPool
  clear(): void
}

/** 计算调度器：合并输入、提交任务、发布结果。 */
export interface IndicatorCalculationScheduler {
  /** 按当前计划刷新全部实例结果，并把成功结果发布给宿主。 */
  refresh(snapshot: MarketSnapshot): void
  /** 提交单个计算身份；已有同版本结果或进行中的任务会被复用。 */
  submit(
    task: CalculationTask,
    snapshot: MarketSnapshot,
    signal?: AbortSignal,
  ): Promise<IndicatorResult>
  /** 读取已提交结果；不触发计算。 */
  get(key: CalculationKey): IndicatorResult | undefined
  invalidate(): void
  invalidateDefinitions(ids: readonly string[]): void
  dispose(): void
}

export interface CreateIndicatorCalculationSchedulerOptions {
  readonly pipeline: CalculationPlanSource
  readonly executor: IndicatorCalculationExecutor
  readonly store: IndicatorResultStore
  readonly onCommit: (pool: IndicatorSeriesPool) => void
  readonly onError?: (error: unknown) => void
  readonly onPending?: (instanceIds: readonly string[], pending: boolean) => void
}
