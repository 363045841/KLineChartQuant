/** 通用侧边面板：菜单互斥、内容懒挂载与停靠侧持久化。 */

import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SidePanelShell from '../SidePanelShell.vue'
import type { SidePanelDefinition, SidePanelSide } from '../types.js'

const icon = defineComponent({ render: () => h('i') })
const PANELS: ReadonlyArray<SidePanelDefinition> = [
  { id: 'agent', label: 'Agent', icon },
  { id: 'watchlist', label: '自选股', icon },
]

/** 挂载带图表与两个面板内容的最小宿主。 */
function mountShell(options: {
  initialPanel?: string | null
  sideStorage?: { load(): SidePanelSide | null | undefined; save(side: SidePanelSide): void }
} = {}) {
  return mount(SidePanelShell, {
    props: { panels: PANELS, ...options },
    slots: {
      chart: () => h('div', { 'data-chart': '' }),
      'panel-agent': ({ toggleSide }: { toggleSide(): void }) =>
        h('div', { 'data-agent': '' }, [h('button', { 'data-toggle-side': '', onClick: toggleSide })]),
      'panel-watchlist': () => h('div', { 'data-watchlist': '' }),
    },
  })
}

describe('SidePanelShell', () => {
  it('mounts panel content only on first open and keeps it for later switching', async () => {
    const wrapper = mountShell()
    expect(wrapper.find('[data-chart]').exists()).toBe(true)
    expect(wrapper.find('[data-agent]').exists()).toBe(false)
    expect(wrapper.findAll('.side-panel-shell__rail-button')[0]?.attributes('aria-pressed')).toBe(
      'false',
    )

    const buttons = wrapper.findAll('.side-panel-shell__rail-button')
    await buttons[0]!.trigger('click')
    expect(wrapper.find('[data-agent]').isVisible()).toBe(true)
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true')

    await buttons[1]!.trigger('click')
    expect(wrapper.find('[data-watchlist]').isVisible()).toBe(true)
    // 已挂载的面板只切可见性，草稿与滚动状态不因切换丢失。
    const bodies = wrapper.findAll('.side-panel-shell__panel-body')
    expect(bodies[0]!.attributes('style')).toContain('display: none')
    expect(buttons[0]!.attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
  })

  it('closes the panel when the active item is clicked again', async () => {
    const wrapper = mountShell()
    const button = wrapper.findAll('.side-panel-shell__rail-button')[0]!

    await button.trigger('click')
    expect(wrapper.classes()).toContain('side-panel-shell--open')

    await button.trigger('click')
    expect(wrapper.classes()).not.toContain('side-panel-shell--open')
    wrapper.unmount()
  })

  it('restores the dock side and persists a side change from panel content', async () => {
    const sideStorage = { load: () => 'left' as const, save: vi.fn() }
    const wrapper = mountShell({ initialPanel: 'agent', sideStorage })
    await nextTick()
    expect(wrapper.classes()).toContain('side-panel-shell--left')

    await wrapper.get('[data-toggle-side]').trigger('click')
    expect(wrapper.classes()).not.toContain('side-panel-shell--left')
    expect(sideStorage.save).toHaveBeenCalledWith('right')
    wrapper.unmount()
  })
})
