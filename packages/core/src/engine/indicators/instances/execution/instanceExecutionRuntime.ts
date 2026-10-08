/**
 * 实例计算执行器。
 *
 * 这是 Worker 与 inline fallback 共用的状态极小的运行时：缓存当前行情与已注册的
 * calculator 定义，执行时只接收 instanceCalculationPlan。
 */
import type { KLineData } from '@/foundation/types/price.js'
import type { TradeSnapshot } from '../../../../data/trades/types.js'
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
  private trades: TradeSnapshot | undefined
  private readonly cache = new Map<
    string,
    { dataRevision: number; tradeRevision: number; output: IndicatorCalculationOutput }
  >()
  private readonly taskDefinitions = new Map<string, IndicatorCalculationDefinition>()
  private readonly definitions = new Map<string, IndicatorCalculationDefinition>()

  constructor(definitions: Iterable<IndicatorCalculationDefinition> = []) {
    for (const definition of definitions) this.addDefinition(definition)
  }

  addDefinition(definition: IndicatorCalculationDefinition): void {
    const previous = this.definitions.get(definition.definitionId)
    if (previous && previous !== definition) {
      throw new TypeError(`Duplicate indicator calculation definition: ${definition.definitionId}`)
    }
    this.definitions.set(definition.definitionId, definition)
  }

  setData(
    data: KLineData[],
    dataRevision: number,
    trades?: TradeSnapshot,
    appendTrades = false,
  ): void {
    if (dataRevision < this.dataRevision) {
      throw new RangeError(`Indicator data revision moved backwards: ${dataRevision}`)
    }
    this.data = data
    this.dataRevision = dataRevision
    this.trades =
      trades && appendTrades
        ? { ...trades, batches: [...(this.trades?.batches ?? []), ...trades.batches] }
        : trades
  }

  execute(plan: IndicatorCalculationPlan): readonly IndicatorCalculationOutput[] {
    const resolve: IndicatorCalculationDefinitionResolver = (definitionId) =>
      this.definitions.get(definitionId)
    const activeKeys = new Set(plan.tasks.map((task) => task.calculationKey))
    for (const key of this.cache.keys()) if (!activeKeys.has(key)) this.cache.delete(key)
    for (const key of this.taskDefinitions.keys())
      if (!activeKeys.has(key)) this.taskDefinitions.delete(key)
    return Object.freeze(
      plan.tasks.map((task) => {
        const definition = resolve(task.definitionId)
        const tradeRevision = definition?.inputs?.includes('trades')
          ? (this.trades?.revision ?? 0)
          : 0
        const cached = this.cache.get(task.calculationKey)
        if (
          cached &&
          cached.dataRevision === this.dataRevision &&
          cached.tradeRevision === tradeRevision
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
          this.trades,
        )
        this.cache.set(task.calculationKey, {
          dataRevision: this.dataRevision,
          tradeRevision,
          output,
        })
        return output
      }),
    )
  }
}
