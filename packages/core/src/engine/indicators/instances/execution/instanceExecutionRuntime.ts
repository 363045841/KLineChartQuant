/**
 * 实例计算执行器。
 *
 * 这是 Worker 与 inline fallback 共用的状态极小的运行时：缓存当前行情与已注册的
 * calculator 定义，执行时只接收 instanceCalculationPlan。
 */
import type { KLineData } from '@/foundation/types/price.js'
import type {
  IndicatorCalculationOutput,
  IndicatorCalculationPlan,
} from '../domain/instanceCalculationPlan.js'
import {
  executeIndicatorCalculationTask,
  type IndicatorCalculationDefinition,
  type IndicatorCalculationDefinitionResolver,
} from './instanceCalculationRuntime.js'

export class IndicatorInstanceExecutionRuntime {
  private data: KLineData[] = []
  private dataRevision = 0
  private readonly cache = new Map<
    string,
    {
      dataRevision: number
      marketRevision: number
      output: Promise<IndicatorCalculationOutput>
    }
  >()
  private readonly taskDefinitions = new Map<string, IndicatorCalculationDefinition>()
  private readonly definitions = new Map<string, IndicatorCalculationDefinition>()

  constructor(
    definitions: Iterable<IndicatorCalculationDefinition> = [],
    private readonly marketData?: () => IndicatorMarketData,
  ) {
    for (const definition of definitions) this.addDefinition(definition)
  }

  addDefinition(definition: IndicatorCalculationDefinition): void {
    const previous = this.definitions.get(definition.definitionId)
    if (previous && previous !== definition) {
      throw new TypeError(`Duplicate indicator calculation definition: ${definition.definitionId}`)
    }
    this.definitions.set(definition.definitionId, definition)
  }

  /** 显式替换已有定义，同时清除该定义的任务计算器与结果；其它指标缓存保留。 */
  updateDefinition(definition: IndicatorCalculationDefinition): void {
    if (!this.definitions.has(definition.definitionId)) {
      throw new TypeError(`Unknown indicator calculation definition: ${definition.definitionId}`)
    }
    this.definitions.set(definition.definitionId, definition)
    this.clearDefinitionTasks(definition.definitionId)
  }

  /** 删除定义并释放它的计算状态。 */
  removeDefinition(id: string): void {
    this.definitions.delete(id)
    this.clearDefinitionTasks(id)
  }

  /** 按定义清理任务状态，新增、更新和删除共享一处失效逻辑。 */
  private clearDefinitionTasks(id: string): void {
    for (const [key, taskDefinition] of this.taskDefinitions) {
      if (taskDefinition.definitionId !== id) continue
      this.taskDefinitions.delete(key)
      this.cache.delete(key)
    }
  }

  /**
   * 写入行情快照。
   * @param data 当前 K 线数据
   * @param dataRevision 数据版本，不允许回退
   */
  setData(data: KLineData[], dataRevision: number): void {
    if (dataRevision < this.dataRevision) {
      throw new RangeError(`Indicator data revision moved backwards: ${dataRevision}`)
    }
    this.data = data
    this.dataRevision = dataRevision
  }

  async execute(plan: IndicatorCalculationPlan): Promise<readonly IndicatorCalculationOutput[]> {
    const market = this.marketData?.()
    const resolve: IndicatorCalculationDefinitionResolver = (definitionId) =>
      this.definitions.get(definitionId)
    const activeKeys = new Set(plan.tasks.map((task) => task.calculationKey))
    market?.retain(activeKeys)
    for (const key of this.cache.keys()) if (!activeKeys.has(key)) this.cache.delete(key)
    for (const key of this.taskDefinitions.keys())
      if (!activeKeys.has(key)) this.taskDefinitions.delete(key)
    // 缓存进行中的 Promise，同一版本并发请求共享计算；新版本替换缓存后旧请求不再写回。
    return Object.freeze(
      await Promise.all(
        plan.tasks.map((task) => {
          const definition = resolve(task.definitionId)
          const cached = this.cache.get(task.calculationKey)
          if (
            cached &&
            cached.dataRevision === this.dataRevision &&
            cached.marketRevision === (market === undefined ? 0 : market.revision)
          )
            return cached.output
          let taskDefinition = this.taskDefinitions.get(task.calculationKey)
          if (!taskDefinition && definition) {
            taskDefinition = {
              ...definition,
              compute: definition.createCompute?.() ?? definition.compute,
            }
            this.taskDefinitions.set(task.calculationKey, taskDefinition)
          }
          const output = executeIndicatorCalculationTask(
            task,
            this.data,
            () => taskDefinition,
            market?.context(task.calculationKey, this.data),
          )
          this.cache.set(task.calculationKey, {
            marketRevision: market === undefined ? 0 : market.revision,
            dataRevision: this.dataRevision,
            output,
          })
          return output
        }),
      ),
    )
  }
}

import type { IndicatorMarketData } from './marketDataTypes.js'
