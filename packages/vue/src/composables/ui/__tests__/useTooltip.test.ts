/** Tooltip delay, description ownership, and the command tooltip adapter. */
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController.js'
import CommandTooltip from '@vue-src/components/commands/CommandTooltip.vue'
import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
import { createChartCommands } from '@vue-src/composables/commands/chartCommands.js'
import { bindChartCommandScope, provideChartCommands } from '@vue-src/composables/commands/useCommands.js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { resetTooltipGroup } from '../useTooltip.js'

enableAutoUnmount(afterEach)

beforeEach(() => {
  resetTooltipGroup()
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

function pointer(target: Element, event: 'pointerenter' | 'pointerleave'): void {
  target.dispatchEvent(new PointerEvent(event))
}

function visibleTips(): string[] {
  return Array.from(document.querySelectorAll('[role="tooltip"].is-open'), (element) => element.textContent?.trim() ?? '')
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

it('delays the first tooltip and immediately opens a nearby one', async () => {
  const wrapper = mount(defineComponent(() => () => h('div', ['Copy', 'Delete'].map((content) =>
    h(BaseTooltip, { content }, () => h('button', content)),
  ))), { attachTo: document.body })
  const [first, second] = wrapper.findAll('.base-tooltip__trigger')
  if (!first || !second) throw new Error('Missing tooltip triggers')
  pointer(first.element, 'pointerenter')
  await advance(299)
  expect(visibleTips()).toEqual([])
  await advance(1)
  expect(visibleTips()).toEqual(['Copy'])
  pointer(first.element, 'pointerleave')
  pointer(second.element, 'pointerenter')
  await nextTick()
  expect(visibleTips()).toContain('Delete')
  await advance(120)
  expect(visibleTips()).toEqual(['Delete'])
})

it('stays open as the pointer crosses into the tip and closes on Escape', async () => {
  const wrapper = mount(BaseTooltip, {
    attachTo: document.body,
    props: { content: 'Copy changes' },
    slots: { default: () => h('button', 'Copy') },
  })
  const trigger = wrapper.get('.base-tooltip__trigger').element
  pointer(trigger, 'pointerenter')
  await advance(300)
  const panel = document.querySelector('[role="tooltip"]')
  if (!panel) throw new Error('Missing tooltip panel')
  pointer(trigger, 'pointerleave')
  pointer(panel, 'pointerenter')
  await advance(150)
  expect(visibleTips()).toEqual(['Copy changes'])
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await nextTick()
  expect(visibleTips()).toEqual([])
})

it('tracks disabled triggers and preserves caller-owned descriptions', async () => {
  const wrapper = mount(BaseTooltip, {
    attachTo: document.body,
    props: { content: 'Help' },
    slots: { default: () => h('button', { disabled: true, 'aria-describedby': 'other' }) },
  })
  const button = wrapper.get('button').element
  const trigger = wrapper.get('.base-tooltip__trigger').element
  await nextTick()
  const tooltipId = document.querySelector('[role="tooltip"]')?.id
  expect(button.getAttribute('aria-describedby')).toBe(`other ${tooltipId}`)
  pointer(trigger, 'pointerenter')
  await advance(300)
  expect(visibleTips()).toEqual([])
  button.disabled = false
  button.setAttribute('aria-describedby', 'changed')
  pointer(trigger, 'pointerenter')
  await advance(300)
  expect(visibleTips()).toEqual(['Help'])
  expect(button.getAttribute('aria-describedby')).toBe(`changed ${tooltipId}`)
  await wrapper.setProps({ content: '' })
  expect(visibleTips()).toEqual([])
  expect(button.getAttribute('aria-describedby')).toBe('changed')
})

it('appends the registered platform shortcut through CommandTooltip', async () => {
  const controller = createMockChartController()
  const wrapper = mount(defineComponent(() => {
    const root = ref<HTMLElement | null>(null)
    const registry = provideChartCommands()
    bindChartCommandScope(registry, root)
    registry.register(createChartCommands({
      controller: () => controller,
      openPalette: vi.fn(),
      toggleFullscreen: vi.fn(),
      openSettings: vi.fn(),
      screenshot: vi.fn(),
    }))
    return () => h('div', { ref: root }, [
      h(CommandTooltip, { content: '放大', command: 'view.zoomIn' }, () => h('button', '放大')),
    ])
  }), { attachTo: document.body })
  pointer(wrapper.get('.base-tooltip__trigger').element, 'pointerenter')
  await advance(300)
  expect(visibleTips()).toEqual(['放大Ctrl+↑'])
})
