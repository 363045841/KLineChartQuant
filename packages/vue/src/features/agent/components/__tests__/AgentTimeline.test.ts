// 时间线渲染测试：工具卡跟随调用块顺序，纯工具调用条目不再显示操作栏。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type {
  AgentTranscriptView,
  ConversationId,
  EntryId,
  EntryRecord,
  ToolCall,
} from '../../agent-contracts.js'
import AgentTimeline from '../AgentTimeline.vue'

/** 构造一条官方条目。 */
function entry(id: number, kind: string, model: EntryRecord['model']): EntryRecord {
  return { id: id as EntryId, conversationId: 1 as ConversationId, kind, model }
}

const call: ToolCall = {
  type: 'toolCall',
  id: 'call-1',
  name: 'chart.inspect',
  arguments: { request: 'inspect' },
}

const transcript: AgentTranscriptView = {
  conversation: { id: 1 as ConversationId },
  items: [
    {
      kind: 'entry',
      entry: entry(1, 'pi.user', [{ role: 'user', content: 'inspect the chart', timestamp: 1 }]),
    },
    {
      kind: 'entry',
      entry: entry(2, 'pi.assistant', [
        {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'Checking the visible range.' }, call],
          api: 'openai-responses',
          provider: 'fake',
          model: 'fake-model',
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'toolUse',
          timestamp: 2,
        },
      ]),
    },
    {
      kind: 'entry',
      entry: entry(3, 'pi.tool-result', [
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'chart.inspect',
          content: [{ type: 'text', text: 'Tool result text' }],
          details: { label: 'Inspect chart', inputSummary: 'inspect', reversible: false },
          isError: false,
          timestamp: 3,
        },
      ]),
    },
    {
      kind: 'entry',
      entry: entry(4, 'pi.assistant', [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Final answer text.' }],
          api: 'openai-responses',
          provider: 'fake',
          model: 'fake-model',
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: 4,
        },
      ]),
    },
  ],
  docs: {},
  title: 'Session',
}

describe('AgentTimeline', () => {
  it('keeps the tool card inside its block order', () => {
    const wrapper = mount(AgentTimeline, {
      props: {
        transcript,
        liveTools: new Map(),
        questions: [],
        error: null,
        collapseReasoning: false,
        locale: 'en',
        actionsDisabled: false,
      },
    })

    const toolOnly = wrapper.findAll('.agent-entry--assistant')[0]!
    const classes = [...toolOnly.element.children].map((child) => child.className)
    const reasoning = classes.findIndex((name) => name.includes('reasoning'))
    const toolCard = classes.findIndex((name) => name.includes('tool-row'))
    expect(reasoning).toBeGreaterThanOrEqual(0)
    expect(toolCard).toBeGreaterThan(reasoning)
    // 工具结果条目本身不单独成卡，调用块只渲染一次。
    expect(wrapper.findAll('.tool-row')).toHaveLength(1)
  })
})
