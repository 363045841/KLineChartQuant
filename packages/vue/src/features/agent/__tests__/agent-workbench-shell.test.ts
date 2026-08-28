import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AgentWorkbenchShell from '../AgentWorkbenchShell.vue'
import { FakeAgentBridge } from '../testing/fake-agent-bridge'

import type { AgentPanelWidthStorage } from '../workbench-shell'

describe('AgentWorkbenchShell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shares chart/panel layout, resizes from the panel border, and keeps the chart mounted', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      left: 0,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    })
    const save = vi.fn<(width: number) => void>()
    const storage: AgentPanelWidthStorage = { load: () => 500, save }
    const wrapper = mount(AgentWorkbenchShell, {
      props: {
        bridge: new FakeAgentBridge({ providerConfigured: true }),
        panelWidthStorage: storage,
      },
      slots: { chart: '<div data-testid="chart-slot">chart</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const panel = wrapper.get('[data-testid="agent-panel"]')
    panel.element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 }),
    )
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 600 }))
    document.dispatchEvent(new MouseEvent('pointerup'))
    expect(save).toHaveBeenLastCalledWith(600)
    expect(wrapper.find('.panel-resizer').exists()).toBe(false)

    await wrapper.get('[data-testid="agent-panel-close"]').trigger('click')
    expect(wrapper.get('[data-testid="agent-panel"]').isVisible()).toBe(false)
    expect(wrapper.get('[data-testid="chart-slot"]').exists()).toBe(true)

    await wrapper.get('[data-testid="agent-panel-open"]').trigger('click')
    expect(wrapper.get('[data-testid="agent-panel"]').isVisible()).toBe(true)
    wrapper.unmount()
  })
})
