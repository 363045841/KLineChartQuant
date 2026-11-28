/** 工作台行情错误恢复期间保留图表及 Agent 实例。 */
import 'fake-indexeddb/auto'
import { defineComponent, h, onMounted, onUnmounted, type ShallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMarketDataHost } from '@363045841yyt/klinechart-core/market-data'
import type { AlertService } from '@363045841yyt/klinechart-core'
import { createDataSourceFixture } from '../../../../core/src/data/provider/__tests__/helpers/providerTestKit.js'
import KlineWorkbench from '../KlineWorkbench.vue'
import { provideBrowserAppRuntime } from '../../composables/runtime/useAppRuntime.js'

const lifecycle = vi.hoisted(() => ({ chartMounted: vi.fn(), chartUnmounted: vi.fn(), agentMounted: vi.fn(), agentUnmounted: vi.fn() }))
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
  it('keeps the application alert service alive after its last workbench closes', async () => {
    const host = createMarketDataHost()
    let alerts: Readonly<ShallowRef<AlertService | null>> | undefined
    const App = defineComponent({
      props: { count: { type: Number, required: true } },
      setup(props) {
        alerts = provideBrowserAppRuntime(host, false, (error) => { throw error })
        return () => Array.from({ length: props.count }, (_, index) => h(KlineWorkbench, {
          key: index, agent: false, scripts: false, layoutStorageId: `tab-${index}`,
        }))
      },
    })
    const wrapper = mount(App, { props: { count: 2 } })
    try {
      await vi.waitFor(() => expect(alerts?.value).not.toBeNull())
      const service = alerts?.value
      expect(service).toBeDefined()
      await wrapper.setProps({ count: 0 })
      await wrapper.setProps({ count: 1 })
      expect(alerts?.value).toBe(service)
    } finally {
      wrapper.unmount()
      host.dispose()
      vi.clearAllMocks()
    }
  })

  it('shows a retry action without replacing the chart or Agent after selection failures', async () => {
    const fixture = createDataSourceFixture([], false)
    vi.spyOn(fixture.source.instruments, 'resolve').mockRejectedValueOnce(new Error('Network unavailable'))
    const host = createMarketDataHost()
    host.registerDataSource(fixture.source)
    const App = defineComponent({
      props: { instrumentId: { type: String, required: true } },
      setup(props) {
        provideBrowserAppRuntime(host, false, (error) => { throw error })
        return () => h(KlineWorkbench, {
      instrument: { source: 'test', id: props.instrumentId }, scripts: false,
      // Agent 面板改为首次展开才挂载，这里显式展开以验证错误恢复期间实例不被重建。
      initialAgentPanelOpen: true,
        })
      },
    })
    const wrapper = mount(App, { props: { instrumentId: 'A' } })
    try {
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('Network unavailable')
      expect(wrapper.find('[data-chart]').exists()).toBe(true)
      expect(wrapper.find('[data-agent]').exists()).toBe(true)
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)

      await wrapper.setProps({ instrumentId: 'missing' })
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('Unknown instrument')
      await wrapper.setProps({ instrumentId: 'B' })
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(lifecycle.chartMounted).toHaveBeenCalledOnce()
      expect(lifecycle.agentMounted).toHaveBeenCalledOnce()
      expect(lifecycle.chartUnmounted).not.toHaveBeenCalled()
      expect(lifecycle.agentUnmounted).not.toHaveBeenCalled()
      expect(wrapper.getComponent(KlineWorkbench).emitted('error')).toHaveLength(2)
    } finally {
      wrapper.unmount()
      host.dispose()
    }
  })
})
