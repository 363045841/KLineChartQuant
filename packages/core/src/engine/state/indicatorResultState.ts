/**
 * 指标计算结果状态。
 * 将当前计算尝试与最近一次成功提交分离，避免失败版本覆盖可绘制结果的来源版本。
 */
import { createSubState } from '../../foundation/reactivity/signal'
import type {
  IndicatorInstanceCalculationResult,
  IndicatorSeriesBundle,
} from '../indicators/workerProtocol'
import { deepFreezeOwned, immutableMap } from './immutable'
import { ownChartIndicatorResult } from './indicatorResultModel'
import type { IndicatorSeriesResult } from './indicatorResultModel'

/** 指标计算尝试的外部可观察状态。 */
export type IndicatorCalculationStatus = 'idle' | 'computing' | 'error'

/** 当前计算尝试。 */
export interface IndicatorCalculationAttempt {
  readonly status: IndicatorCalculationStatus
  readonly requestId: number
  readonly dataRevision: number
  readonly configRevision: number
  readonly error: string | null
}

/** 最近一次成功提交的结果。 */
export interface CommittedIndicatorResult {
  readonly dataRevision: number
  readonly configRevision: number
  readonly resultVersion: number
  readonly projectionVersion: number
  readonly bundle: IndicatorSeriesBundle
  /** 与 series 下标严格对齐的行情时间轴。 */
  readonly timestamps: ReadonlyArray<number>
  /** 按稳定 instanceId 索引的业务结果事实源。 */
  readonly results: ReadonlyMap<string, IndicatorSeriesResult>
  readonly renderStates: ReadonlyMap<string, unknown>
}

/** 指标结果不可变快照。 */
export interface IndicatorResultSnapshot {
  readonly attempt: IndicatorCalculationAttempt
  readonly committed: CommittedIndicatorResult | null
}

/** 指标结果相对于当前 Kernel 数据和配置的可用性。 */
export type IndicatorResultAvailability = 'ready' | 'computing' | 'stale' | 'error'

/** 根据当前数据与配置 revision 判断结果是否可作为当前盘面结果使用。 */
export function resolveIndicatorResultAvailability(
  snapshot: IndicatorResultSnapshot,
  dataRevision: number,
  configRevision: number,
): IndicatorResultAvailability {
  const { attempt, committed } = snapshot
  if (
    attempt.status === 'error' &&
    attempt.dataRevision === dataRevision &&
    attempt.configRevision === configRevision
  )
    return 'error'
  if (
    attempt.status === 'computing' &&
    attempt.dataRevision === dataRevision &&
    attempt.configRevision === configRevision
  )
    return 'computing'
  if (committed?.dataRevision === dataRevision && committed.configRevision === configRevision)
    return 'ready'
  return 'stale'
}

/** 创建初始计算尝试。 */
function emptyAttempt(): IndicatorCalculationAttempt {
  return Object.freeze({
    status: 'idle' as const,
    requestId: 0,
    dataRevision: 0,
    configRevision: 0,
    error: null,
  })
}

/** 创建没有成功结果的初始快照。 */
function emptySnapshot(): IndicatorResultSnapshot {
  return Object.freeze({ attempt: emptyAttempt(), committed: null })
}

/** 创建指标结果状态模块。 */
export function createIndicatorResultState() {
  const { signals, readonly } = createSubState({ snapshot: emptySnapshot() })

  /** 原子替换完整结果快照。 */
  const write = (snapshot: IndicatorResultSnapshot): void => {
    signals.snapshot.set(Object.freeze(snapshot))
  }

  /** 判断提交身份是否仍对应当前计算尝试。 */
  const matchesAttempt = (
    attempt: IndicatorCalculationAttempt,
    input: { requestId: number; dataRevision: number; configRevision: number },
  ): boolean =>
    attempt.status === 'computing' &&
    attempt.requestId === input.requestId &&
    attempt.dataRevision === input.dataRevision &&
    attempt.configRevision === input.configRevision

  return {
    readonly,

    actions: {
      /** 开始一次带身份的计算尝试。 */
      beginCalculation(input: {
        requestId: number
        dataRevision: number
        configRevision: number
      }): void {
        write({
          ...signals.snapshot.peek(),
          attempt: Object.freeze({ ...input, status: 'computing' as const, error: null }),
        })
      },

      /** 校验并原子提交完整结果，返回是否成功生效。 */
      commitResults(input: {
        requestId: number
        dataRevision: number
        configRevision: number
        bundle: IndicatorSeriesBundle
        timestamps: ReadonlyArray<number>
        instanceResults: ReadonlyArray<IndicatorInstanceCalculationResult>
        renderStates: ReadonlyMap<string, unknown>
      }): boolean {
        const previous = signals.snapshot.peek()
        if (!matchesAttempt(previous.attempt, input)) return false
        const previousVersion = previous.committed?.resultVersion ?? 0
        const previousProjection = previous.committed?.projectionVersion ?? 0
        const results = new Map<string, IndicatorSeriesResult>()
        for (const result of input.instanceResults) {
          if (results.has(result.instanceId)) {
            throw new TypeError(`Duplicate indicator instance result: ${result.instanceId}`)
          }
          results.set(result.instanceId, deepFreezeOwned(ownChartIndicatorResult(result)))
        }
        write({
          attempt: Object.freeze({
            status: 'idle' as const,
            requestId: input.requestId,
            dataRevision: input.dataRevision,
            configRevision: input.configRevision,
            error: null,
          }),
          committed: Object.freeze({
            dataRevision: input.dataRevision,
            configRevision: input.configRevision,
            resultVersion: previousVersion + 1,
            projectionVersion: previousProjection + 1,
            bundle: deepFreezeOwned(input.bundle),
            timestamps: deepFreezeOwned(input.timestamps),
            results: immutableMap(results),
            renderStates: immutableMap(input.renderStates),
          }),
        })
        return true
      },

      /** 更新可见范围派生投影，不改变计算结果版本。 */
      updateProjection(input: {
        resultVersion: number
        renderStates: ReadonlyMap<string, unknown>
      }): boolean {
        const previous = signals.snapshot.peek()
        const committed = previous.committed
        if (!committed || committed.resultVersion !== input.resultVersion) return false
        write({
          ...previous,
          committed: Object.freeze({
            ...committed,
            projectionVersion: committed.projectionVersion + 1,
            renderStates: immutableMap(input.renderStates),
          }),
        })
        return true
      },

      /** 校验并记录本次计算失败，同时保留最近成功结果。 */
      failCalculation(input: {
        requestId: number
        dataRevision: number
        configRevision: number
        error: string
      }): boolean {
        const previous = signals.snapshot.peek()
        if (!matchesAttempt(previous.attempt, input)) return false
        write({
          ...previous,
          attempt: Object.freeze({ ...input, status: 'error' as const }),
        })
        return true
      },

      /** 清空结果和计算尝试。 */
      reset(): void {
        write(emptySnapshot())
      },
    },

    /** 销毁状态模块并清空快照。 */
    dispose(): void {
      write(emptySnapshot())
    },
  }
}

export type IndicatorResultStateModule = ReturnType<typeof createIndicatorResultState>
