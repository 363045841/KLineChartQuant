import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { AgentMessageView } from '../agent-contracts.js'
import AgentMessageItem from '../components/AgentMessageItem.vue'

/** 构造用于折叠行为断言的消息视图。 */
function reasoningMessage(status: AgentMessageView['status']): AgentMessageView {
  return { id: 'reasoning-1', role: 'reasoning', content: '推理内容', createdAt: 0, status }
}

describe('AgentMessageItem reasoning collapse', () => {
  it('expands a streaming reasoning block by default', () => {
    const wrapper = mount(AgentMessageItem, {
      props: {
        message: reasoningMessage('streaming'),
        collapseReasoning: false,
        locale: 'en',
      },
    })

    expect(wrapper.get('details').attributes('open')).toBeDefined()
  })

  it('keeps reasoning collapsed while streaming when the option is enabled', () => {
    const wrapper = mount(AgentMessageItem, {
      props: {
        message: reasoningMessage('streaming'),
        collapseReasoning: true,
        locale: 'en',
      },
    })

    expect(wrapper.get('details').attributes('open')).toBeUndefined()
    expect(wrapper.get('details').text()).toContain('推理内容')
  })

  it('keeps completed reasoning collapsed regardless of the option', () => {
    const wrapper = mount(AgentMessageItem, {
      props: {
        message: reasoningMessage('complete'),
        collapseReasoning: false,
        locale: 'en',
      },
    })

    expect(wrapper.get('details').attributes('open')).toBeUndefined()
  })
})
