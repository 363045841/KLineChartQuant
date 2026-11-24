/** 计算器仓库：保存已注册定义与其计算器实例；不保存行情快照、任务或取消状态。 */
import type { CalculationTask } from '../domain/calculationPlan.js'
import { executeIndicatorCalculationTask, type IndicatorCalculator } from './indicatorCalculator.js'
import type { IndicatorMarketData } from './marketDataTypes.js'
import type { IndicatorCalculationExecutor, MarketSnapshot } from './types.js'

export class IndicatorCalculatorRegistry implements IndicatorCalculationExecutor {
  private readonly definitions = new Map<string, IndicatorCalculator>()
  private readonly calculators = new Map<string, IndicatorCalculator & { dispose?: () => void }>()

  constructor(
    definitions: Iterable<IndicatorCalculator> = [],
    private readonly marketData?: () => IndicatorMarketData,
  ) {
    for (const definition of definitions) this.addDefinition(definition)
  }

  /** 同一对象重复注册幂等；替换定义时先移除旧定义及其计算器。 */
  addDefinition(definition: IndicatorCalculator): void {
    const existing = this.definitions.get(definition.definitionId)
    if (existing && existing !== definition)
      throw new TypeError(`Duplicate indicator calculator: ${definition.definitionId}`)
    this.definitions.set(definition.definitionId, definition)
  }

  private removeDefinition(id: string): void {
    this.definitions.delete(id)
    for (const [key, calculator] of this.calculators) {
      if (calculator.definitionId !== id) continue
      calculator.dispose?.()
      this.calculators.delete(key)
    }
  }

  /** 批量移除定义；供装配层在定义提交中一次释放。 */
  removeDefinitions(ids: readonly string[]): void {
    for (const id of ids) this.removeDefinition(id)
  }

  /** 活动计划拥有计算器与行情租约；不在集合内的资源立即释放。 */
  retain(tasks: readonly CalculationTask[]): void {
    const keys = new Set(tasks.map((task) => task.calculationKey))
    for (const [key, calculator] of this.calculators) {
      if (keys.has(key)) continue
      calculator.dispose?.()
      this.calculators.delete(key)
    }
    this.marketData?.().retain(keys)
  }

  /** 执行一个不可变输入；取消信号来自任务生命周期，不解释实时更新。 */
  execute: IndicatorCalculationExecutor['execute'] = (task, snapshot, signal) => {
    signal.throwIfAborted()
    let calculator = this.calculators.get(task.calculationKey)
    if (!calculator) {
      const definition = this.definitions.get(task.definitionId)
      if (!definition)
        return Promise.reject(new TypeError(`Unknown indicator definition: ${task.definitionId}`))
      const compute = definition.createCompute?.()
      calculator = {
        ...definition,
        compute: compute ?? definition.compute,
        dispose: compute?.dispose,
      }
      this.calculators.set(task.calculationKey, calculator)
    }
    const context = this.marketData?.().context(task.calculationKey, snapshot.data)
    return executeIndicatorCalculationTask(
      task,
      snapshot,
      () => calculator,
      context ? { ...context, signal } : undefined,
    )
  }

  /** 销毁不负责取消执行；调用方先取消调度任务，再释放仓库。 */
  dispose(): void {
    for (const calculator of this.calculators.values()) calculator.dispose?.()
    this.calculators.clear()
    this.definitions.clear()
  }
}
