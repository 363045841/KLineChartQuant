/** 连接状态机：纯迁移函数。副作用以 effect 描述，由连接驱动层执行。 */

import type { StreamEvent, StreamPhase } from '../types.js'
import type { BackoffPolicy } from './policy.js'

/** 连接状态；`attempt` 是连续失败次数，`healthySince` 用于稳定期判定。 */
export interface MachineState {
  readonly phase: StreamPhase
  readonly attempt: number
  readonly healthySince: number | null
}

/** 驱动状态机的事件。 */
export type MachineEvent =
  | { kind: 'connect'; now: number }
  | { kind: 'opened'; now: number }
  | { kind: 'closed'; now: number; retryable: boolean; message: string }
  | { kind: 'resume' }
  | { kind: 'force' }
  | { kind: 'stop'; reason: string }

/** 状态机要求的副作用；驱动层是唯一执行者。 */
export type MachineEffect =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'backoff'; attempt: number }
  | { kind: 'cancel' }
  | { kind: 'watchdog'; active: boolean }
  | { kind: 'emit'; event: StreamEvent }

/** 初始状态。 */
export function initialState(): MachineState {
  return { phase: 'stopped', attempt: 0, healthySince: null }
}

/**
 * 推进状态机。
 *
 * @param state - 当前状态
 * @param event - 触发事件
 * @param policy - 退避参数；只用于判断稳定期是否已过
 * @returns 下一个状态与需要执行的副作用
 */
export function transition(
  state: MachineState,
  event: MachineEvent,
  policy: BackoffPolicy,
): [MachineState, MachineEffect[]] {
  switch (event.kind) {
    case 'connect':
      if (state.phase === 'connecting' || state.phase === 'online') return [state, []]
      return [
        { ...state, phase: 'connecting' },
        [{ kind: 'cancel' }, { kind: 'open' }],
      ]

    case 'opened': {
      const reconnected = state.attempt > 0 || state.healthySince !== null
      return [
        { ...state, phase: 'online', healthySince: event.now },
        [{ kind: 'watchdog', active: true }, { kind: 'emit', event: { kind: 'opened', reconnected } }],
      ]
    }

    case 'closed': {
      if (state.phase === 'stopped') return [state, []]
      // 稳定存活期已过才清零，抖动端点不会一直按最小间隔重连。
      const stable = state.healthySince !== null && event.now - state.healthySince >= policy.stableMs
      const attempt = stable ? 0 : state.attempt
      if (!event.retryable) {
        return [
          { phase: 'stopped', attempt, healthySince: null },
          [
            { kind: 'watchdog', active: false },
            { kind: 'close' },
            { kind: 'emit', event: { kind: 'stopped', reason: event.message } },
          ],
        ]
      }
      return [
        { phase: 'backing-off', attempt: attempt + 1, healthySince: null },
        [
          { kind: 'watchdog', active: false },
          { kind: 'close' },
          { kind: 'emit', event: { kind: 'lost', reason: event.message } },
          { kind: 'backoff', attempt },
        ],
      ]
    }

    case 'resume':
      // 只在等待重连时立即重试；在线或连接中的连接不受影响。
      if (state.phase !== 'backing-off') return [state, []]
      return [{ ...state, phase: 'connecting' }, [{ kind: 'cancel' }, { kind: 'open' }]]

    case 'force':
      if (state.phase === 'stopped') return [state, []]
      return [{ ...state, phase: 'connecting' }, [{ kind: 'cancel' }, { kind: 'close' }, { kind: 'open' }]]

    case 'stop':
      return [
        { phase: 'stopped', attempt: 0, healthySince: null },
        [
          { kind: 'cancel' },
          { kind: 'watchdog', active: false },
          { kind: 'close' },
          { kind: 'emit', event: { kind: 'stopped', reason: event.reason } },
        ],
      ]
  }
}
