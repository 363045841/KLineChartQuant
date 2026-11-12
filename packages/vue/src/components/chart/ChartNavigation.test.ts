/** 导航按钮与快捷键共用命令，改绑后 Tooltip 同步读取注册表。 */
import {
  type CommandRegistry,
  createIdleInteractionSnapshot,
} from '@363045841yyt/klinechart-core'
import type { DeviceEnvironment } from '@363045841yyt/klinechart-core/config'
import { mount } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController.js'
import { createChartCommands } from '@vue-src/composables/commands/chartCommands.js'
import { provideChartCommands } from '@vue-src/composables/commands/useCommands.js'
import { resetTooltipGroup } from '@vue-src/composables/ui/useTooltip.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import ChartNavigation from './ChartNavigation.vue'

/** 设备快照由 composable 提供；用例直接改写它，不依赖 UA 探测结果。 */
const device = vi.hoisted(() => ({ deviceType: 'desktop' as DeviceEnvironment['deviceType'] }))

vi.mock('@vue-src/composables/useDeviceEnvironment.js', async () => {
  const { computed } = await import('vue')
  return {
    useDeviceEnvironment: () =>
      computed<DeviceEnvironment>(() => ({
        deviceType: device.deviceType,
        isCoarsePointer: device.deviceType !== 'desktop',
        resolved: true,
      })),
  }
})

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
      return () => h('div', { ref: root, tabindex: 0 }, h(ChartNavigation, { controller }))
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, registry, controller }
}

afterEach(() => {
  device.deviceType = 'desktop'
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

  it('keeps only the reset command on non-desktop devices', async () => {
    device.deviceType = 'mobile'
    const { wrapper } = mountNavigation()
    try {
      const commands = wrapper.findAll('button').map((button) => button.attributes('data-command'))
      expect(commands).toEqual(['view.reset'])
    } finally {
      wrapper.unmount()
    }
  })

  it('fades out only the reset button after reset and restores it when the view changes', async () => {
    const { wrapper, controller } = mountNavigation()
    try {
      await wrapper.get('[data-command="view.zoomIn"]').trigger('click')
      await nextTick()
      expect(wrapper.find('.is-dismissed').exists()).toBe(false)

      await wrapper.get('[data-command="view.reset"]').trigger('click')
      await nextTick()
      const faded = wrapper.get('.is-dismissed')
      expect(faded.find('[data-command="view.reset"]').exists()).toBe(true)
      expect(faded.find('[data-command="view.zoomIn"]').exists()).toBe(false)

      // 鼠标移动不是视图交互，不得恢复按钮。
      document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
      await nextTick()
      expect(wrapper.find('.is-dismissed').exists()).toBe(true)

      // 缩放改变了 zoomLevel，恢复按钮。
      controller._setViewport({
        ...controller.viewport.peek(),
        zoomLevel: controller.viewport.peek().zoomLevel + 1,
      })
      await nextTick()
      expect(wrapper.find('.is-dismissed').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('restores the reset button after a drag that changes the view but not after a click', async () => {
    const { wrapper, controller } = mountNavigation()
    try {
      await wrapper.get('[data-command="view.reset"]').trigger('click')
      await nextTick()
      expect(wrapper.find('.is-dismissed').exists()).toBe(true)

      const idle = createIdleInteractionSnapshot()
      // 点击：拖拽起止，但视图没有变化。
      controller._setInteractionState({ ...idle, isDragging: true })
      controller._setInteractionState(idle)
      await nextTick()
      expect(wrapper.find('.is-dismissed').exists()).toBe(true)

      // 拖拽：结束前可见区间发生平移。
      controller._setInteractionState({ ...idle, isDragging: true })
      controller._setViewport({
        ...controller.viewport.peek(),
        visibleTo: controller.viewport.peek().visibleTo + 3,
      })
      controller._setInteractionState(idle)
      await nextTick()
      expect(wrapper.find('.is-dismissed').exists()).toBe(false)
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
