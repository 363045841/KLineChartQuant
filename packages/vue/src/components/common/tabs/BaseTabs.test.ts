/** Shared tab and filter semantics, keyboard navigation, and overflow. */
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import BaseTabs from './BaseTabs.vue'
import { useTabPanel } from './useTabPanel.js'

enableAutoUnmount(afterEach)

const tabs = [{ id: 'first', label: 'First' }, { id: 'last', label: 'Last' }]

it('updates selection, focus, and the panel label together', async () => {
  const wrapper = mount(defineComponent({
    setup() {
      const selected = ref('first')
      const { panelId, panelAttrs } = useTabPanel(() => selected.value)
      return () => h('div', [
        h(BaseTabs, { tabs, modelValue: selected.value, panelId, 'onUpdate:modelValue': (id: string) => { selected.value = id } }),
        h('div', panelAttrs.value, selected.value),
      ])
    },
  }), { attachTo: document.body })
  const first = wrapper.get<HTMLButtonElement>('[role="tab"]:first-child')
  const last = wrapper.get('[role="tab"]:nth-child(2)')
  const panel = wrapper.get('[role="tabpanel"]')
  expect(first.attributes('aria-controls')).toBe(panel.attributes('id'))
  expect(first.attributes('tabindex')).toBe('0')
  expect(last.attributes('tabindex')).toBe('-1')
  first.element.focus()
  await first.trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement).toBe(last.element)
  expect(last.attributes('aria-selected')).toBe('true')
  expect(panel.attributes('aria-labelledby')).toBe(last.attributes('id'))
  expect(panel.text()).toBe('last')
})

it('renders pressed buttons for filters with no tab panel', () => {
  const wrapper = mount(BaseTabs, { props: { tabs, modelValue: 'first' } })
  expect(wrapper.get('[role="group"] button').attributes('aria-pressed')).toBe('true')
  expect(wrapper.find('[role="tab"]').exists()).toBe(false)
})

it('scrolls an overflowing strip and leaves the wheel alone at its boundary', () => {
  const wrapper = mount(BaseTabs, { props: { tabs, modelValue: 'first' } })
  const nav = wrapper.get('nav').element
  Object.defineProperties(nav, { scrollWidth: { value: 300 }, clientWidth: { value: 200 } })
  const wheel = () => new WheelEvent('wheel', { deltaY: 100, cancelable: true })
  expect(nav.dispatchEvent(wheel())).toBe(false)
  expect(nav.scrollLeft).toBe(100)
  expect(nav.dispatchEvent(wheel())).toBe(true)
})
