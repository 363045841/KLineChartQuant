/** 指标执行适配；Script 的 Worker 由 Script 服务管理，Core 不另建计算 Worker。 */
import type { IndicatorCalculationDefinition } from './instanceCalculationRuntime.js'
import type { IndicatorCalculationExecutor } from './instanceCalculationScheduler.js'
import { IndicatorInstanceExecutionRuntime } from './instanceExecutionRuntime.js'
import type { IndicatorMarketData } from './marketDataTypes.js'

export type InlineIndicatorCalculationExecutor = IndicatorCalculationExecutor & {
  addDefinitions(definitions: Iterable<IndicatorCalculationDefinition>): void
  updateDefinitions(definitions: Iterable<IndicatorCalculationDefinition>): void
  removeDefinitions(ids: readonly string[]): void
}

/** 委派到注册定义的计算端口，原生扩展与 Script 服务使用相同调度语义。 */
export function createInlineIndicatorCalculationExecutor(definitions: Iterable<IndicatorCalculationDefinition>, marketData?: () => IndicatorMarketData): InlineIndicatorCalculationExecutor {
  const runtime = new IndicatorInstanceExecutionRuntime(definitions, marketData)
  return Object.freeze({
    /** 追加定义不修改已有任务。 */
    addDefinitions(next: Iterable<IndicatorCalculationDefinition>): void { for (const definition of next) runtime.addDefinition(definition) },
    /** 替换定义并失效任务缓存。 */
    updateDefinitions(next: Iterable<IndicatorCalculationDefinition>): void { for (const definition of next) runtime.updateDefinition(definition) },
    /** 移除定义及关联任务。 */
    removeDefinitions(ids: readonly string[]): void { for (const id of ids) runtime.removeDefinition(id) },
    async setData(data, revision) { runtime.setData(data, revision) },
    async execute(plan) { return runtime.execute(plan) },
  } satisfies InlineIndicatorCalculationExecutor)
}
