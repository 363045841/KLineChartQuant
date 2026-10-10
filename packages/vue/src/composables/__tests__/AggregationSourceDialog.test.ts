/** 管理弹窗必须提供空状态和宿主连接入口。 */

import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AggregationSourceDialog from '../../components/AggregationSourceDialog.vue'
import { createOnlineProbe, registerProvider, source } from './_aggregationSourceFixtures'

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
  it('probes a newly added source while the dialog is open', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AggregationSourceDialog, {
      props: { show: true, sources: [], enabledNames: new Set<string>(), endpoints: {} },
      global: { stubs: { BaseModal: { template: '<section><slot /></section>' } } },
    })
    const probe = createOnlineProbe()
    registerProvider('late-connection', probe)
    await wrapper.setProps({ sources: [source('late-connection')] })
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(probe).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('在线')
    wrapper.unmount()
    marketDataProviderRegistry.unregister('late-connection')
    vi.useRealTimers()
  })
})
