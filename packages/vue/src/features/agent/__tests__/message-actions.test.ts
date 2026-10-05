// 本文件验证回复复制与历史运行重新生成的按钮行为。
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AgentMessageItem from '../components/AgentMessageItem.vue'
import AgentTimeline from '../components/AgentTimeline.vue'

describe('reply actions', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('copies Markdown source and reverts the feedback state', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(AgentMessageItem, {
      props: {
        message: {
          id: 'reply',
          role: 'assistant',
          content: '**Answer**',
          createdAt: 1,
          status: 'complete',
        },
        locale: 'zh-CN',
        collapseReasoning: false,
        showActions: true,
      },
    })
    try {
      const button = wrapper.get('.message__actions button')
      await button.trigger('click')
      expect(writeText).toHaveBeenCalledWith('**Answer**')
      expect(button.attributes('data-status')).toBe('copied')
      vi.advanceTimersByTime(2000)
      await nextTick()
      expect(button.attributes('data-status')).toBe('idle')
    } finally {
      wrapper.unmount()
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('regenerates the selected historical run rather than the latest run', async () => {
    const wrapper = mount(AgentTimeline, {
      props: {
        messages: [
          {
            id: 'intermediate',
            runId: 'old',
            role: 'assistant',
            content: 'Working',
            status: 'complete',
            createdAt: 1,
          },
          {
            id: 'final',
            runId: 'old',
            role: 'assistant',
            content: 'Answer',
            status: 'complete',
            createdAt: 2,
          },
        ],
        runs: [{ id: 'old', sessionId: 'session', status: 'completed', endedAt: 3 }],
        run: { id: 'latest', sessionId: 'session', status: 'completed' },
        toolCalls: [],
        confirmations: [],
        questions: [],
        error: null,
        canUndo: false,
        collapseReasoning: false,
        locale: 'zh-CN',
      },
    })
    expect(wrapper.findAll('.message__actions')).toHaveLength(1)
    await wrapper.findAll('.message__actions button')[1]!.trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['old']])
    wrapper.unmount()
  })
})
