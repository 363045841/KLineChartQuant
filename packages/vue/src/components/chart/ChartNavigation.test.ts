/** 导航按钮与快捷键共用命令，改绑后 Tooltip 同步读取注册表。 */
import type { CommandRegistry } from '@363045841yyt/klinechart-core'
import { mount } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController.js'
import { createChartCommands } from '@vue-src/composables/commands/chartCommands.js'
import { provideChartCommands } from '@vue-src/composables/commands/useCommands.js'
import { resetTooltipGroup } from '@vue-src/composables/ui/useTooltip.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import ChartNavigation from './ChartNavigation.vue'

/** 使用真实注册表与既有控制器替身挂载导航栏。 */
function mountNavigation() {
  const controller = createMockChartController()
  let registry!: CommandRegistry
  const Host = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      registry = provideChartCommands(root)
      registry.register(
        createChartCommands({
          controller: () => controller,
          openPalette: vi.fn(),
          toggleFullscreen: vi.fn(),
          openSettings: vi.fn(),
          screenshot: vi.fn(),
        }),
      )
      return () => h('div', { ref: root, tabindex: 0 }, h(ChartNavigation))
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, registry, controller }
}

afterEach(() => {
  resetTooltipGroup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ChartNavigation', () => {
  it('executes the same five controller actions as the registered keys', async () => {
    const { wrapper, controller } = mountNavigation()
    try {
      const zoomOut = vi.spyOn(controller, 'zoomOut')
      const zoomIn = vi.spyOn(controller, 'zoomIn')
      const move = vi.spyOn(controller, 'scrollByBars')
      const reset = vi.spyOn(controller, 'resetChart')
      for (const button of wrapper.findAll('button')) await button.trigger('click')
      expect(zoomOut).toHaveBeenCalledOnce()
      expect(zoomIn).toHaveBeenCalledOnce()
      expect(move.mock.calls).toEqual([[-1], [1]])
      expect(reset).toHaveBeenCalledOnce()
      wrapper.element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
      expect(reset).toHaveBeenCalledTimes(2)
    } finally {
      wrapper.unmount()
    }
  })

  it('updates the visible tooltip after rebinding and clearing the shortcut', async () => {
    vi.useFakeTimers()
    const { wrapper, registry } = mountNavigation()
    try {
      const button = wrapper.get('[data-command="view.reset"]')
      button.element.parentElement?.dispatchEvent(new PointerEvent('pointerenter'))
      vi.advanceTimersByTime(300)
      await nextTick()
      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('Alt+R')
      registry.setShortcut('view.reset', 'Alt+T')
      await nextTick()
      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('Alt+T')
      registry.setShortcut('view.reset', null)
      await nextTick()
      expect(document.querySelector('[role="tooltip"] .base-tooltip__shortcut')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })
})
