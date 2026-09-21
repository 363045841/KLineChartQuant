/**
 * 实例计算执行器。
 *
 * 这是 Worker 与 inline fallback 共用的状态极小的运行时：缓存当前行情与已注册的
 * calculator 定义，执行时只接收 instanceCalculationPlan。
 */
import type { KLineData } from '../../../../foundation/types/price.js'
import {
  executeIndicatorCalculationPlan,
  type IndicatorCalculationDefinition,
  type IndicatorCalculationDefinitionResolver,
} from './instanceCalculationRuntime.js'
import type {
  IndicatorCalculationOutput,
  IndicatorCalculationPlan,
} from '../domain/instanceCalculationPlan.js'

export class IndicatorInstanceExecutionRuntime {
  private data: KLineData[] = []
  private dataRevision = 0
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

  setData(data: KLineData[], dataRevision: number): void {
    if (dataRevision < this.dataRevision) {
      throw new RangeError(`Indicator data revision moved backwards: ${dataRevision}`)
    }
    this.data = data
    this.dataRevision = dataRevision
  }

  execute(plan: IndicatorCalculationPlan): readonly IndicatorCalculationOutput[] {
    const resolve: IndicatorCalculationDefinitionResolver = (definitionId) =>
      this.definitions.get(definitionId)
    return executeIndicatorCalculationPlan(plan, this.data, resolve)
  }
}
