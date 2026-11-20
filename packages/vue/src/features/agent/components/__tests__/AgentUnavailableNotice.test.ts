// 验证运行时不可用时的占位视图：展示通用说明、错误详情并提供重试入口。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentUnavailableNotice from '../AgentUnavailableNotice.vue'

describe('AgentUnavailableNotice', () => {
  it('shows the failure detail and emits retry', async () => {
    const wrapper = mount(AgentUnavailableNotice, {
      props: {
        locale: 'zh-CN',
        error: {
          code: 'INVALID_PROTOCOL',
          message: 'The Agent host sent an unsupported message.',
          retryable: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Agent 工作区无法启动')
    expect(wrapper.text()).toContain('The Agent host sent an unsupported message.')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
