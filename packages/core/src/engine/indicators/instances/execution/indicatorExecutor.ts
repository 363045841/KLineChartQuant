/** 图表执行适配器：连接定义仓库与单任务执行端口，不包含调度状态。 */
import type { IndicatorCalculator } from './indicatorCalculator.js'
import { IndicatorCalculatorRegistry } from './indicatorCalculatorRegistry.js'
import type { IndicatorMarketData } from './marketDataTypes.js'
import type { IndicatorCalculationExecutor } from './types.js'

export type IndicatorExecutor = IndicatorCalculationExecutor & {
  addDefinitions(definitions: Iterable<IndicatorCalculator>): void
  updateDefinitions(definitions: Iterable<IndicatorCalculator>): void
  removeDefinitions(ids: readonly string[]): void
  dispose(): void
}

/** Script 定义通过自己的计算端口使用 Worker，Core 不创建第二套线程。 */
export function createIndicatorExecutor(
  definitions: Iterable<IndicatorCalculator>,
  marketData?: () => IndicatorMarketData,
): IndicatorExecutor {
  const registry = new IndicatorCalculatorRegistry(definitions, marketData)
  return {
    retain: (tasks) => registry.retain(tasks),
    execute: registry.execute,
    addDefinitions(next) {
      for (const definition of next) registry.addDefinition(definition)
    },
    updateDefinitions(next) {
      for (const definition of next) registry.updateDefinition(definition)
    },
    removeDefinitions(ids) {
      registry.removeDefinitions(ids)
    },
    dispose: () => registry.dispose(),
  }
}
