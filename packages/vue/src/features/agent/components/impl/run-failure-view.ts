// 运行失败的展示投影：官方失败原因决定提示级别与恢复动作，不引入自定义错误码。
import type { RunFailureReason } from '../../agent-contracts.js'
import type { VisibleRunFailureReason } from '../../agent-copy/types.js'
import type { RunFailureView } from '../../workspace/impl/agent-live.js'

/** 用户能从失败提示里直接执行的动作。 */
export type RunFailureAction = 'continue' | 'configure'

/** 失败在时间线上的呈现：级别决定配色，动作决定按钮。 */
export interface RunFailureNotice {
  readonly reason: VisibleRunFailureReason
  /** error 用危险色，warning 用警示色；文案由 agent-copy 按原因提供。 */
  readonly tone: 'error' | 'warning'
  readonly action?: RunFailureAction
  /** 官方给的原始说明，原样展示，不做转述。 */
  readonly detail?: string
}

/** 每种可见原因的呈现方式；没有动作的原因只提示原因本身。 */
const PRESENTATION: Record<
  VisibleRunFailureReason,
  { readonly tone: RunFailureNotice['tone']; readonly action?: RunFailureAction }
> = {
  model_error: { tone: 'error', action: 'continue' },
  no_model: { tone: 'error', action: 'configure' },
  faulted: { tone: 'error' },
  orphaned: { tone: 'error' },
  interrupted: { tone: 'error', action: 'continue' },
  restart_limit: { tone: 'error', action: 'continue' },
  nothing_to_answer: { tone: 'warning' },
  turn_limit: { tone: 'warning', action: 'continue' },
}

/** 用户主动中止，或官方 reset 之后自动接着跑：都不该打扰用户。 */
function isVisibleRunFailure(reason: RunFailureReason): reason is VisibleRunFailureReason {
  return reason !== 'aborted' && reason !== 'reset'
}

/**
 * 把官方运行失败投影成时间线提示。
 * @param failure 官方 `pi.live.runFailure` 的展示视图。
 * @returns 需要展示的提示；不需要打扰用户的原因返回 undefined。
 */
export function toRunFailureNotice(failure: RunFailureView): RunFailureNotice | undefined {
  if (!isVisibleRunFailure(failure.reason)) return undefined
  const { reason } = failure
  const { tone, action } = PRESENTATION[reason]
  return {
    reason,
    tone,
    ...(action === undefined ? {} : { action }),
    ...(failure.detail === undefined ? {} : { detail: failure.detail }),
  }
}
