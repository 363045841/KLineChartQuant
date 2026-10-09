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

/** 成交快照更新意图：replace 携带整段快照，append 的 snapshot 只携带新增批次。 */
export interface TradeSnapshotDiff {
  readonly mode: 'append' | 'replace'
  readonly snapshot: TradeSnapshot
}

/**
 * 判断本次成交快照相对上一份是否为引用前缀。
 * 是则返回仅含新增批次的 append 增量，避免 Worker 全量结构化克隆；否则返回整段 replace。
 * 长度不变时增量为空，用于成交内容未变（仅版本推进）时避免重复克隆整段批次。
 */
export function diffTradeSnapshot(
  previous: TradeSnapshot | undefined,
  next: TradeSnapshot,
): TradeSnapshotDiff {
  if (
    previous !== undefined &&
    next.batches.length >= previous.batches.length &&
    previous.batches.every((batch, index) => batch === next.batches[index])
  ) {
    return {
      mode: 'append',
      snapshot: { ...next, batches: next.batches.slice(previous.batches.length) },
    }
  }
  return { mode: 'replace', snapshot: next }
}

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

  /**
   * 写入行情快照。
   * @param data 当前 K 线数据
   * @param dataRevision 数据版本，不允许回退
   * @param tradesDiff 成交更新意图；缺省表示清空成交
   */
  setData(data: KLineData[], dataRevision: number, tradesDiff?: TradeSnapshotDiff): void {
    if (dataRevision < this.dataRevision) {
      throw new RangeError(`Indicator data revision moved backwards: ${dataRevision}`)
    }
    this.data = data
    this.dataRevision = dataRevision
    this.trades = this.mergeTrades(tradesDiff)
  }

  /** 按显式模式合并成交：replace 覆盖整段，append 在已缓存批次后追加增量。 */
  private mergeTrades(diff: TradeSnapshotDiff | undefined): TradeSnapshot | undefined {
    if (diff === undefined) return undefined
    if (diff.mode === 'replace') return diff.snapshot
    return {
      ...diff.snapshot,
      batches: [...(this.trades?.batches ?? []), ...diff.snapshot.batches],
    }
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
