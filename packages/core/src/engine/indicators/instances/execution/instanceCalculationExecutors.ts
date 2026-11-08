/** 图表执行适配器：连接定义仓库与单任务执行端口，不包含调度状态。 */
import type { IndicatorCalculationDefinition } from './instanceCalculationRuntime.js'
import { IndicatorInstanceExecutionRuntime } from './instanceExecutionRuntime.js'
import type { IndicatorMarketData } from './marketDataTypes.js'
import type { IndicatorCalculationExecutor } from './types.js'

export type InlineIndicatorCalculationExecutor = IndicatorCalculationExecutor & {
  addDefinitions(definitions: Iterable<IndicatorCalculationDefinition>): void
  updateDefinitions(definitions: Iterable<IndicatorCalculationDefinition>): void
  removeDefinitions(ids: readonly string[]): void
  dispose(): void
}

/** Script定义通过自己的计算端口使用Worker，Core不创建第二套线程。 */
export function createInlineIndicatorCalculationExecutor(
  definitions: Iterable<IndicatorCalculationDefinition>,
  marketData?: () => IndicatorMarketData,
): InlineIndicatorCalculationExecutor {
  const runtime = new IndicatorInstanceExecutionRuntime(definitions, marketData)
  return {
    get revision() {
      return runtime.revision
    },
    retain: (tasks) => runtime.retain(tasks),
    execute: runtime.execute,
    addDefinitions(next) {
      for (const definition of next) runtime.addDefinition(definition)
    },
    updateDefinitions(next) {
      for (const definition of next) runtime.updateDefinition(definition)
    },
    removeDefinitions(ids) {
      for (const id of ids) runtime.removeDefinition(id)
    },
    dispose: () => runtime.dispose(),
  }
}
