/** 工作台行情错误恢复期间保留图表及 Agent 实例。 */
import { defineComponent, h, onMounted, onUnmounted } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMarketDataHost } from '@363045841yyt/klinechart-core/market-data'
import { createDataSourceFixture } from '../../../../core/src/data/provider/__tests__/helpers/providerTestKit.js'
import KlineWorkbench from '../KlineWorkbench.vue'

const lifecycle = vi.hoisted(() => ({ chartMounted: vi.fn(), chartUnmounted: vi.fn(), agentMounted: vi.fn(), agentUnmounted: vi.fn() }))
const initialize = vi.hoisted(() => vi.fn<() => Promise<undefined>>(async () => undefined))

vi.mock('../impl/useWorkbenchServices.js', () => ({ useWorkbenchServices: () => ({ initialize }) }))
vi.mock('../../components/chart/KLineChart.vue', () => ({
  default: defineComponent({
    setup() {
      onMounted(lifecycle.chartMounted)
      onUnmounted(lifecycle.chartUnmounted)
      return () => h('div', { 'data-chart': '' })
    },
  }),
}))
vi.mock('../impl/WorkbenchAgent.vue', () => ({
  __esModule: true,
  default: defineComponent({
    setup(_props, { slots }) {
      onMounted(lifecycle.agentMounted)
      onUnmounted(lifecycle.agentUnmounted)
      return () => h('div', { 'data-agent': '' }, slots.default?.())
    },
  }),
}))

describe('workbench recovery', () => {
  it('mounts the chart while script initialization is pending and reports failures without removing it', async () => {
    let rejectInitialization: (error: Error) => void = () => {}
    initialize.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectInitialization = reject
    }))
    const wrapper = mount(KlineWorkbench, { props: { agent: false } })
    try {
      expect(wrapper.find('[data-chart]').exists()).toBe(true)
      const error = new Error('Script initialization failed')
      rejectInitialization(error)
      await flushPromises()
      expect(wrapper.emitted('error')).toEqual([[error]])
      expect(wrapper.find('[data-chart]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
      vi.clearAllMocks()
    }
  })

  it('shows a retry action without replacing the chart or Agent after selection failures', async () => {
    const fixture = createDataSourceFixture([], false)
    vi.spyOn(fixture.source.instruments, 'resolve').mockRejectedValueOnce(new Error('Network unavailable'))
    const host = createMarketDataHost()
    host.registerDataSource(fixture.source)
    const wrapper = mount(KlineWorkbench, { props: {
      marketDataContext: host, instrument: { sourceId: 'test', id: 'A' }, scripts: false,
    } })
    try {
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('Network unavailable')
      expect(wrapper.find('[data-chart]').exists()).toBe(true)
      expect(wrapper.find('[data-agent]').exists()).toBe(true)
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)

      await wrapper.setProps({ instrument: { sourceId: 'test', id: 'missing' } })
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('Unknown instrument')
      await wrapper.setProps({ instrument: { sourceId: 'test', id: 'B' } })
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(lifecycle.chartMounted).toHaveBeenCalledOnce()
      expect(lifecycle.agentMounted).toHaveBeenCalledOnce()
      expect(lifecycle.chartUnmounted).not.toHaveBeenCalled()
      expect(lifecycle.agentUnmounted).not.toHaveBeenCalled()
      expect(wrapper.emitted('error')).toHaveLength(2)
    } finally {
      wrapper.unmount()
      host.dispose()
    }
  })
})
