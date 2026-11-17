// 提问重建测试：判定只看宿主事实（挂起提问或工具声明的呈现方式）。
import { describe, expect, it } from 'vitest'
import type {
  QuestionView,
  ToolCall,
  ToolResultMessage,
} from '../../../agent-contracts.js'
import { readAskUserQuestion } from '../ask-user-view.js'

const PROMPT = 'Which instrument?'
const OPTIONS = [
  { value: 'a', label: '南玻A', description: 'SZ' },
  { value: 'b', label: '国债指数', description: 'SH' },
]

/** 模型提交的提问调用。 */
const CALL: ToolCall = {
  type: 'toolCall',
  id: 'call-1',
  name: 'ask_user',
  arguments: { question: PROMPT, options: OPTIONS, multiSelect: true },
}

/** 构造一条工具结果；details 只写用例关心的字段。 */
function result(text: string, presentation?: 'question'): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: 'call-1',
    toolName: 'ask_user',
    content: [{ type: 'text', text }],
    details: presentation === undefined ? {} : { presentation },
    isError: false,
    timestamp: 1,
  }
}

/** 宿主挂起中的同一次提问。 */
const STORED: QuestionView = {
  id: 'q-1',
  toolCallId: 'call-1',
  prompt: PROMPT,
  options: OPTIONS,
  multiSelect: true,
  status: 'pending',
}

describe('readAskUserQuestion', () => {
  it('缺少宿主事实或提问内容时不冒充卡片', () => {
    // 没有挂起提问，也没声明 presentation：这只是普通工具调用。
    expect(readAskUserQuestion({ call: CALL, result: result('done') })).toBeNull()
    // 参数不足以构成提问：空标题与空选项都不渲染卡片。
    expect(
      readAskUserQuestion({
        call: { ...CALL, arguments: { question: '', options: OPTIONS } },
        presentation: 'question',
        result: result('x', 'question'),
      }),
    ).toBeNull()
    expect(
      readAskUserQuestion({
        call: { ...CALL, arguments: { question: PROMPT, options: [] } },
        presentation: 'question',
        result: result('x', 'question'),
      }),
    ).toBeNull()
  })

  it('挂起提问原样返回，保留答复所需的提问身份', () => {
    expect(readAskUserQuestion({ call: CALL, stored: STORED })).toBe(STORED)
  })

  it.each<[string, string, Partial<QuestionView>]>([
    [
      '答复',
      JSON.stringify({ status: 'answered', selected: ['b'], note: '首选' }),
      { status: 'answered', answer: { selectedValues: ['b'], note: '首选' } },
    ],
    ['取消', JSON.stringify({ status: 'cancelled' }), { status: 'cancelled' }],
  ])('把已提交的%s结果重建为提问，文本与选项来自调用参数', (_label, text, expected) => {
    const question = readAskUserQuestion({
      call: CALL,
      presentation: 'question',
      result: result(text, 'question'),
    })

    expect(question).toMatchObject({
      toolCallId: 'call-1',
      prompt: PROMPT,
      multiSelect: true,
      ...expected,
    })
    expect(question?.options).toEqual(OPTIONS)
  })
})
