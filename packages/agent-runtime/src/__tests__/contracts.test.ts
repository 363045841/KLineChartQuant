// 契约测试：引用标记、错误视图与稳定协议版本。
import { describe, expect, it } from 'vitest'
import { AgentRuntimeError, formatAgentCitation } from '../index.js'

describe('agent contracts', () => {
  it('encodes citation markers for the assistant body', () => {
    expect(formatAgentCitation('web:run-1:call-1:1')).toBe('[[cite:web:run-1:call-1:1]]')
  })

  it('serializes runtime errors into the UI view', () => {
    const view = new AgentRuntimeError('SESSION_LOCKED', 'busy', {
      retryable: true,
      recommendedAction: 'Close the other tab.',
    }).toView()
    expect(view).toEqual({
      code: 'SESSION_LOCKED',
      message: 'busy',
      retryable: true,
      recommendedAction: 'Close the other tab.',
    })
  })
})
