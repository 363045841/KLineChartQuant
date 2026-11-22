/**
 * 计算结果仓库：按计算身份保存已提交结果。
 *
 * 图表实例与预览计算共用这一份存储；结果自带计算时的行情快照身份，
 * 读取方据此判断是否还需要重算。
 */
import type { CalculationPlan, IndicatorSeriesOutput } from '../domain/calculationPlan.js'
import { toIndicatorResult } from '../domain/calculationPlan.js'
import type {
  CalculationKey,
  IndicatorResult,
  IndicatorSeriesPool,
} from '../domain/indicatorModel.js'
import type { IndicatorResultStore, MarketSnapshot } from './types.js'

interface StoredResult {
  readonly output: IndicatorSeriesOutput
  readonly snapshot: MarketSnapshot
}

/** 比较两次计算的版本新旧；先比数据修订，再比行情修订。 */
function isNewer(next: MarketSnapshot, previous: MarketSnapshot): boolean {
  return (
    next.dataRevision > previous.dataRevision ||
    (next.dataRevision === previous.dataRevision && next.marketRevision >= previous.marketRevision)
  )
}

/** 创建结果仓库；同一计算身份只保留最新一次提交。 */
export function createIndicatorResultStore(): IndicatorResultStore {
  const completed = new Map<CalculationKey, StoredResult>()

  return {
    publish(output, snapshot) {
      const previous = completed.get(output.calculationKey)
      if (previous && !isNewer(snapshot, previous.snapshot)) return
      completed.set(output.calculationKey, { output, snapshot })
    },

    get(key) {
      const stored = completed.get(key)
      return stored === undefined
        ? undefined
        : toIndicatorResult(stored.output, stored.snapshot, stored.snapshot.timestamps)
    },

    retain(keys) {
      for (const key of completed.keys()) if (!keys.has(key)) completed.delete(key)
    },

    snapshot(plan, snapshot) {
      const results = new Map<string, IndicatorResult>()
      for (const task of plan.tasks) {
        const stored = completed.get(task.calculationKey)
        if (!stored) continue
        const result = toIndicatorResult(stored.output, stored.snapshot, stored.snapshot.timestamps)
        for (const instanceId of task.instanceIds) results.set(instanceId, result)
      }
      return Object.freeze({ timestamps: snapshot.timestamps, results })
    },

    clear() {
      completed.clear()
    },
  }
}
