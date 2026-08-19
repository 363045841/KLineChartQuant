/**
 * 指标计算结果状态。
 * 将当前计算尝试与最近一次成功提交分离，避免失败版本覆盖可绘制结果的来源版本。
 */
import { createSubState } from '../../foundation/reactivity/signal'
import type { IndicatorSeriesBundle } from '../indicators/workerProtocol'
import { immutableMap } from './immutable'

/** 指标计算尝试的外部可观察状态。 */
export type IndicatorCalculationStatus = 'idle' | 'computing' | 'error'

/** 当前计算尝试。 */
export interface IndicatorCalculationAttempt {
  readonly status: IndicatorCalculationStatus
  readonly requestId: number
  readonly dataVersion: number
  readonly configVersion: number
  readonly error: string | null
}

/** 最近一次成功提交的结果。 */
export interface CommittedIndicatorResult {
  readonly dataVersion: number
  readonly configVersion: number
  readonly resultVersion: number
  readonly projectionVersion: number
  readonly bundle: IndicatorSeriesBundle
  readonly renderStates: ReadonlyMap<string, unknown>
}

/** 指标结果不可变快照。 */
export interface IndicatorResultSnapshot {
  readonly attempt: IndicatorCalculationAttempt
  readonly committed: CommittedIndicatorResult | null
}

/** 创建初始计算尝试。 */
function emptyAttempt(): IndicatorCalculationAttempt {
  return Object.freeze({
    status: 'idle' as const,
    requestId: 0,
    dataVersion: 0,
    configVersion: 0,
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
    input: { requestId: number; dataVersion: number; configVersion: number },
  ): boolean =>
    attempt.status === 'computing' &&
    attempt.requestId === input.requestId &&
    attempt.dataVersion === input.dataVersion &&
    attempt.configVersion === input.configVersion

  return {
    readonly,

    actions: {
      /** 开始一次带身份的计算尝试。 */
      beginCalculation(input: {
        requestId: number
        dataVersion: number
        configVersion: number
      }): void {
        write({
          ...signals.snapshot.peek(),
          attempt: Object.freeze({ ...input, status: 'computing' as const, error: null }),
        })
      },

      /** 校验并原子提交完整结果，返回是否成功生效。 */
      commitResults(input: {
        requestId: number
        dataVersion: number
        configVersion: number
        bundle: IndicatorSeriesBundle
        renderStates: ReadonlyMap<string, unknown>
      }): boolean {
        const previous = signals.snapshot.peek()
        if (!matchesAttempt(previous.attempt, input)) return false
        const previousVersion = previous.committed?.resultVersion ?? 0
        const previousProjection = previous.committed?.projectionVersion ?? 0
        write({
          attempt: Object.freeze({
            status: 'idle' as const,
            requestId: input.requestId,
            dataVersion: input.dataVersion,
            configVersion: input.configVersion,
            error: null,
          }),
          committed: Object.freeze({
            dataVersion: input.dataVersion,
            configVersion: input.configVersion,
            resultVersion: previousVersion + 1,
            projectionVersion: previousProjection + 1,
            bundle: input.bundle,
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
        dataVersion: number
        configVersion: number
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
