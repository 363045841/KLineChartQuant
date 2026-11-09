/** 验证标签切换保留工作台实例，只有关闭标签才卸载对应工作台。 */
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import WorkspaceContent from '../WorkspaceContent.vue'

const lifecycle = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }))
vi.mock('../../workbench/KlineWorkbench.vue', async () => {
  const { defineComponent, h, onUnmounted } = await import('vue')
  return {
    default: defineComponent({
      name: 'KlineWorkbench',
      setup() {
        const id = ++lifecycle.mounted
        onUnmounted(() => {
          lifecycle.unmounted++
        })
        return () => h('div', { 'data-instance': id })
      },
    }),
  }
})

it('切换与排序不重建图表，关闭时只销毁对应实例', async () => {
  const a = { id: 'a', spec: null }
  const b = { id: 'b', spec: null }
  const wrapper = mount(WorkspaceContent, { props: { tabs: [a, b], activeTabId: 'a' } })
  try {
    expect(lifecycle.mounted).toBe(2)
    expect(wrapper.get<HTMLElement>('[data-instance="1"]').element.style.display).not.toBe('none')
    expect(wrapper.get<HTMLElement>('[data-instance="2"]').element.style.display).toBe('none')
    await wrapper.setProps({ activeTabId: 'b', tabs: [b, a] })
    expect(lifecycle.mounted).toBe(2)
    expect(lifecycle.unmounted).toBe(0)
    expect(wrapper.get<HTMLElement>('[data-instance="2"]').element.style.display).not.toBe('none')
    await wrapper.setProps({ tabs: [b] })
    expect(lifecycle.unmounted).toBe(1)
    expect(wrapper.get<HTMLElement>('[data-instance="2"]').element.style.display).not.toBe('none')
  } finally {
    wrapper.unmount()
  }
  expect(lifecycle.unmounted).toBe(2)
})
