/** 定义与计算器仓库；不保存数据快照、运行任务、计算版本或取消控制器。 */
import type { IndicatorCalculationTask } from '../domain/instanceCalculationPlan.js'
import {
  executeIndicatorCalculationTask,
  type IndicatorCalculationDefinition,
} from './instanceCalculationRuntime.js'
import type { IndicatorMarketData } from './marketDataTypes.js'
import type { IndicatorCalculationExecutor } from './types.js'

export class IndicatorInstanceExecutionRuntime implements IndicatorCalculationExecutor {
  private readonly definitions = new Map<string, IndicatorCalculationDefinition>()
  private readonly calculators = new Map<
    string,
    IndicatorCalculationDefinition & { dispose?: () => void }
  >()

  constructor(
    definitions: Iterable<IndicatorCalculationDefinition> = [],
    private readonly marketData?: () => IndicatorMarketData,
  ) {
    for (const definition of definitions) this.addDefinition(definition)
  }

  get revision(): number {
    return this.marketData?.().revision ?? 0
  }

  /** 注册定义；同一对象重复注册幂等，其它同名对象必须显式更新。 */
  addDefinition(definition: IndicatorCalculationDefinition): void {
    const existing = this.definitions.get(definition.definitionId)
    if (existing && existing !== definition)
      throw new TypeError(`Duplicate indicator calculation definition: ${definition.definitionId}`)
    this.definitions.set(definition.definitionId, definition)
  }

  /** 新定义只影响后续执行；旧执行持有自己的快照，发布资格由调度器决定。 */
  updateDefinition(definition: IndicatorCalculationDefinition): void {
    if (!this.definitions.has(definition.definitionId))
      throw new TypeError(`Unknown indicator calculation definition: ${definition.definitionId}`)
    this.removeDefinition(definition.definitionId)
    this.definitions.set(definition.definitionId, definition)
  }

  removeDefinition(id: string): void {
    this.definitions.delete(id)
    for (const [key, calculator] of this.calculators) {
      if (calculator.definitionId !== id) continue
      calculator.dispose?.()
      this.calculators.delete(key)
    }
  }

  /** 活动计划拥有计算器与行情租约；展示实例共用同一计算身份。 */
  retain(tasks: readonly IndicatorCalculationTask[]): void {
    const keys = new Set(tasks.map((task) => task.calculationKey))
    for (const [key, calculator] of this.calculators) {
      if (keys.has(key)) continue
      calculator.dispose?.()
      this.calculators.delete(key)
    }
    this.marketData?.().retain(keys)
  }

  /** 执行一个不可变输入；取消信号来自任务生命周期，不解释实时更新。 */
  execute: IndicatorCalculationExecutor['execute'] = (task, input, signal) => {
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
    const context = this.marketData?.().context(task.calculationKey, input.data)
    return executeIndicatorCalculationTask(
      task,
      input,
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
