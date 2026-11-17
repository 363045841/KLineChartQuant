// ask_user 工具契约测试：提问是工具调用，答复与放弃都是正常结果。
import { describe, expect, it, vi } from 'vitest'
import type { AskUserOutcome } from '../tools/ask-user-tool.js'
import { ASK_USER_TOOL_NAME, createAskUserTool } from '../tools/ask-user-tool.js'

/** 一次最小提问。 */
const REQUEST = {
  question: 'Which instrument?',
  options: [
    { value: 'a', label: '南玻A' },
    { value: 'b', label: '国债指数' },
  ],
  multiSelect: false,
}

/** 工具执行上下文；只用到会话与调用身份。 */
function context() {
  return {
    sessionId: 's-1',
    runId: 'r-1',
    toolCallId: 'call-1',
    signal: new AbortController().signal,
    progress: () => undefined,
  }
}

/** 用固定结果构造工具，并记录宿主收到的请求。 */
function createTool(outcome: AskUserOutcome) {
  const request = vi.fn(async () => outcome)
  return { tool: createAskUserTool({ request }), request }
}

describe('createAskUserTool', () => {
  it('声明为提问呈现的只读串行工具', () => {
    const { tool } = createTool({ status: 'cancelled' })
    expect(tool.name).toBe(ASK_USER_TOOL_NAME)
    expect(tool.effect).toBe('read')
    expect(tool.executionMode).toBe('sequential')
    expect(tool.presentation).toBe('question')
  })

  it.each<[string, AskUserOutcome, unknown, string]>([
    [
      '选项答复',
      { status: 'answered', answer: { selectedValues: ['b'], note: '首选' } },
      { status: 'answered', selected: ['b'], note: '首选' },
      'selected',
    ],
    [
      '纯文本答复',
      { status: 'answered', answer: { selectedValues: [], note: '自定义' } },
      { status: 'answered', selected: [], note: '自定义' },
      'free text',
    ],
    ['跳过', { status: 'cancelled' }, { status: 'cancelled' }, 'declined'],
  ])('%s 以正常结果返回给模型', async (_label, outcome, content, summary) => {
    const { tool } = createTool(outcome)
    const result = await tool.execute(REQUEST, context())

    expect(JSON.parse(result.content)).toEqual(content)
    expect(result.summary).toContain(summary)
    expect(result.failure).toBeUndefined()
  })

  it('把提问与会话身份交给宿主', async () => {
    const { tool, request } = createTool({ status: 'cancelled' })
    await tool.execute(REQUEST, context())

    expect(request).toHaveBeenCalledWith(
      { prompt: REQUEST.question, options: REQUEST.options, multiSelect: false },
      expect.objectContaining({ sessionId: 's-1', toolCallId: 'call-1' }),
    )
  })
})
