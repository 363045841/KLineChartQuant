// 验证运行时不可用视图按错误码展示文案并提供可重试入口。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentUnavailableNotice from '../AgentUnavailableNotice.vue'

describe('AgentUnavailableNotice', () => {
  it('shows locked guidance and emits retry', async () => {
    const wrapper = mount(AgentUnavailableNotice, {
      props: {
        locale: 'zh-CN',
        error: {
          code: 'SESSION_LOCKED',
          message: 'Agent sessions are open in another page.',
          retryable: true,
        },
      },
    })

    expect(wrapper.text()).toContain('另一个标签页')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
