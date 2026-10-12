/** 验证连接地址应用与数据源开关对搜索、行情使用的影响。 */
import { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarketDataManagementDialog from '../../components/MarketDataManagementDialog.vue'
import { MARKET_DATA_CONTEXT_KEY } from '../useMarketDataContext'

describe('source management', () => {
  it.each([true, false])('toggles search and routing from enabled=%s', async (enabled) => {
    const context = new MarketDataContext()
    context.registry.register(
      {
        source: { id: 'source', displayName: '测试源' },
        catalog: { search: async () => [] },
        probe: async () => ({ status: 'online', checkedAt: 1 }),
      },
      { enabled, searchEnabled: !enabled },
    )
    const wrapper = mount(MarketDataManagementDialog, {
      props: { show: true },
      global: {
        provide: { [MARKET_DATA_CONTEXT_KEY]: context },
        stubs: { BaseModal: { template: '<section><slot /></section>' } },
      },
    })
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
    const toggle = wrapper.get('input[type="checkbox"]')
    for (const nextEnabled of [!enabled, enabled]) {
      await toggle.setValue(nextEnabled)
      expect(context.registry.getConfig('source')).toMatchObject({
        enabled: nextEnabled,
        searchEnabled: nextEnabled,
      })
      expect(context.registry.getEnabled().map((provider) => provider.source.id)).toEqual(
        nextEnabled ? ['source'] : [],
      )
      expect(
        context.registry.getSearchableByPriority().map((provider) => provider.source.id),
      ).toEqual(nextEnabled ? ['source'] : [])
    }
    wrapper.unmount()
    context.dispose()
  })

  it('shows host connection entry for an empty instance', () => {
    const context = new MarketDataContext()
    const wrapper = mount(MarketDataManagementDialog, {
      props: { show: true },
      slots: { 'source-management': '<button>连接我的行情源</button>' },
      global: {
        provide: { [MARKET_DATA_CONTEXT_KEY]: context },
        stubs: { BaseModal: { template: '<section><slot /></section>' } },
      },
    })
    expect(wrapper.get('[role="status"]').text()).toContain('暂无可用数据源')
    wrapper.unmount()
    context.dispose()
  })

  it('applies a shared address only after submission', async () => {
    const context = new MarketDataContext()
    for (const id of ['one', 'two'])
      context.registry.register({
        source: {
          id,
          displayName: id,
          connectionId: 'shared',
          defaultBaseUrl: 'http://localhost:8000',
        },
        probe: async () => ({ status: 'online', checkedAt: 1 }),
      })
    const wrapper = mount(MarketDataManagementDialog, {
      props: { show: true },
      global: {
        provide: { [MARKET_DATA_CONTEXT_KEY]: context },
        stubs: { BaseModal: { template: '<section><slot /></section>' } },
      },
    })
    expect(wrapper.findAll('input[type="url"]')).toHaveLength(1)
    await wrapper.get('input[type="url"]').setValue('http://localhost:9000')
    expect(context.registry.getConfig('one').baseUrl).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(context.registry.getConfig('two').baseUrl).toBe('http://localhost:9000')
    wrapper.unmount()
    context.dispose()
  })
})
