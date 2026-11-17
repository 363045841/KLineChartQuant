// 时间线渲染测试：提问在调用位置渲染成卡片，普通工具仍是折叠行。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type {
  AgentTranscriptView,
  ConversationId,
  EntryId,
  EntryRecord,
  JsonValue,
  QuestionView,
  ToolCall,
} from '../../agent-contracts.js'
import AgentTimeline from '../AgentTimeline.vue'
import type { RunFailureView } from '../../workspace/impl/agent-live.js'

/** 官方条目共用的用量字段。 */
const USAGE = {
  input: 1,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 1,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

const PROMPT = 'Which instrument?'
const OPTIONS = [
  { value: 'a', label: '南玻A' },
  { value: 'b', label: '国债指数' },
]

/** 构造一条官方条目。 */
function entry(id: number, kind: string, model: EntryRecord['model']): EntryRecord {
  return { id: id as EntryId, conversationId: 1 as ConversationId, kind, model }
}

/** 带思考与一次工具调用的助手条目。 */
function assistantWithTool(call: ToolCall): EntryRecord {
  return entry(2, 'pi.assistant', [
    {
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'Checking the chart.' }, call],
      api: 'openai-responses',
      provider: 'fake',
      model: 'fake-model',
      usage: USAGE,
      stopReason: 'toolUse',
      timestamp: 2,
    },
  ])
}

/** 工具结果条目；details 只写用例关心的字段。 */
function toolResult(
  call: ToolCall,
  text: string,
  options: { readonly isError?: boolean; readonly details?: JsonValue } = {},
): EntryRecord {
  return entry(3, 'pi.tool-result', [
    {
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: 'text', text }],
      details: options.details ?? {},
      isError: options.isError ?? false,
      timestamp: 3,
    },
  ])
}

/** 挂载时间线；条目包装成官方读取结果。 */
function mountTimeline(input: {
  readonly entries: readonly EntryRecord[]
  readonly questions?: readonly QuestionView[]
  readonly runFailure?: RunFailureView
}) {
  const transcript: AgentTranscriptView = {
    conversation: { id: 1 as ConversationId },
    items: input.entries.map((item) => ({ kind: 'entry', entry: item })),
    docs: {},
    title: 'Session',
  }
  return mount(AgentTimeline, {
    props: {
      transcript,
      liveTools: new Map(),
      questions: input.questions ?? [],
      runFailure: input.runFailure,
      collapseReasoning: false,
      locale: 'en',
      actionsDisabled: false,
    },
  })
}

/** 普通工具调用的调用参数。 */
const INSPECT: ToolCall = {
  type: 'toolCall',
  id: 'call-1',
  name: 'chart.inspect',
  arguments: { request: 'inspect' },
}

/** 提问工具调用的调用参数。 */
const ASK: ToolCall = {
  type: 'toolCall',
  id: 'ask-1',
  name: 'ask_user',
  arguments: { question: PROMPT, options: OPTIONS },
}

/** 宿主挂起的同一次提问。 */
const PENDING: QuestionView = {
  id: 'q-1',
  toolCallId: 'ask-1',
  prompt: PROMPT,
  options: OPTIONS,
  multiSelect: false,
  status: 'pending',
}

describe('AgentTimeline', () => {
  it('keeps a plain tool call as one collapsed row after the reasoning block', () => {
    const wrapper = mountTimeline({
      entries: [assistantWithTool(INSPECT), toolResult(INSPECT, 'done')],
    })

    const classes = [...wrapper.findAll('.agent-entry--assistant')[0]!.element.children].map(
      (child) => child.className,
    )
    expect(classes.findIndex((name) => name.includes('reasoning'))).toBeGreaterThanOrEqual(0)
    expect(classes.findIndex((name) => name.includes('tool-row'))).toBeGreaterThan(
      classes.findIndex((name) => name.includes('reasoning')),
    )
    expect(wrapper.findAll('.tool-row')).toHaveLength(1)
    expect(wrapper.find('[data-focus="question"]').exists()).toBe(false)
  })

  it('renders a pending question in place of the tool row and submits the choice', async () => {
    const wrapper = mountTimeline({ entries: [assistantWithTool(ASK)], questions: [PENDING] })

    const card = wrapper.find('[data-focus="question"]')
    expect(wrapper.findAll('.tool-row')).toHaveLength(0)
    expect(card.text()).toContain(PROMPT)
    expect(card.text()).not.toContain('Clarification required')
    expect(card.find('input').attributes('placeholder')).toBe('Type a requirement')

    const submit = card.find('.question__submit')
    expect(submit.attributes('aria-label')).toBe('Send answer')
    expect(submit.text()).toBe('')

    await card.findAll('.question__option')[1]!.trigger('click')
    await submit.trigger('click')

    expect(wrapper.emitted('answer')).toEqual([['q-1', { selectedValues: ['b'] }]])
  })

  it('把已回答的提问折叠成一行，不再保留工具行', () => {
    const wrapper = mountTimeline({
      entries: [
        assistantWithTool(ASK),
        toolResult(ASK, JSON.stringify({ status: 'answered', selected: ['b'], note: '偶数' }), {
          details: { presentation: 'question' },
        }),
      ],
    })

    expect(wrapper.findAll('.tool-row')).toHaveLength(0)
    expect(wrapper.find('[data-focus="question"]').exists()).toBe(false)
    expect(wrapper.find('.question-summary').text()).toBe('Ask(Chosen: 国债指数 · 偶数)')
  })

  it('未作答时在只读卡片上方给出一行 Ask(未作答)', () => {
    const wrapper = mountTimeline({
      entries: [
        assistantWithTool(ASK),
        toolResult(ASK, JSON.stringify({ status: 'cancelled' }), {
          details: { presentation: 'question' },
        }),
      ],
    })

    const card = wrapper.find('[data-focus="question"]')
    expect(wrapper.findAll('.tool-row')).toHaveLength(0)
    expect(wrapper.find('.question-summary').text()).toBe('Ask(Not answered)')
    expect(card.find('.question__prompt').text()).toBe(PROMPT)
    expect(card.findAll('.question__option')).toHaveLength(OPTIONS.length)
    expect(card.findAll('.question__option')[0]!.attributes('disabled')).toBeDefined()
    expect(card.find('.question__reply').exists()).toBe(false)
  })

  it('falls back to the tool row when the call cannot be read as a question', () => {
    const invalid: ToolCall = {
      type: 'toolCall',
      id: 'ask-2',
      name: 'ask_user',
      arguments: { question: PROMPT, options: [] },
    }
    const wrapper = mountTimeline({
      entries: [assistantWithTool(invalid), toolResult(invalid, 'Invalid options', { isError: true })],
    })

    expect(wrapper.findAll('.tool-row')).toHaveLength(1)
    expect(wrapper.find('[data-focus="question"]').exists()).toBe(false)
  })

  it('shows the official run failure after the entries and continues the run', async () => {
    const wrapper = mountTimeline({
      entries: [],
      runFailure: { reason: 'model_error', detail: 'upstream 502' },
    })

    const notice = wrapper.find('[data-focus="run-failure"]')
    expect(notice.text()).toContain('The model request failed.')
    expect(notice.text()).toContain('upstream 502')
    await notice.find('button').trigger('click')
    expect(wrapper.emitted('resume')).toHaveLength(1)
  })
})
