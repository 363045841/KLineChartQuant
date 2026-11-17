// 运行失败投影测试：官方十种原因各自的提示级别、恢复动作与是否打扰用户。
import { describe, expect, it } from 'vitest'
import type { RunFailureReason } from '../../../agent-contracts.js'
import { toRunFailureNotice } from '../run-failure-view.js'

/** 时间线对每种官方原因的全部预期；silent 原因为 undefined，detail 缺省表示官方没有给说明。 */
const CASES: ReadonlyArray<
  [
    RunFailureReason,
    'error' | 'warning' | undefined,
    'continue' | 'configure' | undefined,
    string | undefined,
  ]
> = [
  ['model_error', 'error', 'continue', 'upstream 502'],
  ['no_model', 'error', 'configure', undefined],
  ['faulted', 'error', undefined, 'task threw'],
  ['orphaned', 'error', undefined, undefined],
  ['interrupted', 'error', 'continue', undefined],
  ['restart_limit', 'error', 'continue', undefined],
  ['nothing_to_answer', 'warning', undefined, undefined],
  ['turn_limit', 'warning', 'continue', undefined],
  ['aborted', undefined, undefined, undefined],
  ['reset', undefined, undefined, undefined],
]

describe('toRunFailureNotice', () => {
  it.each(CASES)('%s → 级别 %s，动作 %s，详情 %s', (reason, tone, action, detail) => {
    const notice = toRunFailureNotice({
      reason,
      ...(detail === undefined ? {} : { detail }),
    })

    if (tone === undefined) {
      expect(notice).toBeUndefined()
      return
    }
    expect(notice).toEqual({
      reason,
      tone,
      ...(action === undefined ? {} : { action }),
      ...(detail === undefined ? {} : { detail }),
    })
  })
})
