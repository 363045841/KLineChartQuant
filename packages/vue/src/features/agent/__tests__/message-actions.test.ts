// 本文件验证回复复制与历史运行重新生成的按钮行为。
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AgentMessageItem from '../components/AgentMessageItem.vue'
import AgentTimeline from '../components/AgentTimeline.vue'

describe('reply actions', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 使用真实消息组件验证编辑动作，不模拟组件内部状态。 */
  function mountEditable(action: (runId: string, prompt: string) => Promise<void>) {
    return mount(AgentMessageItem, {
      props: {
        message: {
          id: 'user',
          runId: 'historical',
          role: 'user',
          content: 'Original\nquestion',
          createdAt: 1,
        },
        locale: 'zh-CN',
        collapseReasoning: false,
        editMessage: action,
      },
    })
  }

  it('edits the selected user message, preserves multiline input and cancels without submitting', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountEditable(action)
    try {
      await wrapper.get('button[aria-label="编辑消息"]').trigger('click')
      expect(wrapper.get('textarea').element.value).toBe('Original\nquestion')
      await wrapper.get('textarea').setValue('Changed\nquestion')
      await wrapper.get('textarea').trigger('keydown', { key: 'Escape' })
      expect(action).not.toHaveBeenCalled()
      expect(wrapper.find('textarea').exists()).toBe(false)
      await wrapper.get('button[aria-label="编辑消息"]').trigger('click')
      await wrapper.get('textarea').setValue('Changed\nquestion')
      await wrapper
        .get('textarea')
        .trigger('keydown', { key: 'Enter', ctrlKey: true, isComposing: true })
      expect(action).not.toHaveBeenCalled()
      await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
      await flushPromises()
      expect(action).toHaveBeenCalledWith('historical', 'Changed\nquestion')
      expect(wrapper.find('textarea').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('retains the draft after a rejected edit and prevents empty or concurrent submissions', async () => {
    let reject = (_failure: Error) => {}
    const action = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise
        }),
    )
    const wrapper = mountEditable(action)
    try {
      await wrapper.get('button[aria-label="编辑消息"]').trigger('click')
      await wrapper.get('textarea').setValue('  ')
      await wrapper.get('form').trigger('submit')
      expect(action).not.toHaveBeenCalled()
      await wrapper.get('textarea').setValue('Keep draft')
      await wrapper.get('form').trigger('submit')
      await wrapper.get('form').trigger('submit')
      expect(action).toHaveBeenCalledTimes(1)
      expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
      reject(new Error('Provider unavailable'))
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe('Provider unavailable')
      expect(wrapper.get('textarea').element.value).toBe('Keep draft')
      await wrapper.setProps({ editDisabled: true })
      await wrapper.get('form').trigger('submit')
      expect(action).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
    }
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
