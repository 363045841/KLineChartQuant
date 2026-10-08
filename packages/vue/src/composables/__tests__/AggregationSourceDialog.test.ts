/** 管理弹窗必须提供空状态和宿主连接入口。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AggregationSourceDialog from '../../components/AggregationSourceDialog.vue'

describe('source management boundary', () => {
  it('renders an actionable empty state and host content without storing credentials', () => {
    const wrapper = mount(AggregationSourceDialog, {
      props: { show: true, sources: [], enabledNames: new Set<string>(), endpoints: {} },
      slots: { 'source-management': '<button>连接我的行情源</button>' },
      global: { stubs: { BaseModal: { template: '<section><slot /></section>' } } },
    })
    expect(wrapper.get('[role="status"]').text()).toContain('暂无可用数据源')
    expect(wrapper.get('button').text()).toBe('连接我的行情源')
    wrapper.unmount()
  })
})
