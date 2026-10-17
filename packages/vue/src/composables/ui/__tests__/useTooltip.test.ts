/** BaseTooltip：首个提示延迟显示，相邻提示即时显示；Esc 关闭；键盘聚焦可触发。 */

import { mount } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController.js'
import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
import { createChartCommands } from '@vue-src/composables/commands/chartCommands.js'
import { provideChartCommands } from '@vue-src/composables/commands/useCommands.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { resetTooltipGroup } from '../useTooltip.js'

const Pair = defineComponent({
  setup() {
    return () =>
      h('div', [
        h(BaseTooltip, { content: '复制' }, () => h('button', { id: 'a', 'aria-label': '复制' })),
        h(BaseTooltip, { content: '删除' }, () => h('button', { id: 'b', 'aria-label': '删除' })),
      ])
  },
})

function trigger(id: string): HTMLElement {
  return document.getElementById(id)?.parentElement as HTMLElement
}

function tooltipTexts(): string[] {
  return [...document.querySelectorAll('[role="tooltip"]')].map((el) => el.textContent ?? '')
}

describe('BaseTooltip 分组延迟', () => {
  beforeEach(() => {
    resetTooltipGroup()
    vi.useFakeTimers()
  })

  it('首个提示等待 showDelay，移到相邻触发器时立即显示', async () => {
    const wrapper = mount(Pair, { attachTo: document.body })
    trigger('a').dispatchEvent(new PointerEvent('pointerenter'))
    await nextTick()
    expect(tooltipTexts()).toEqual([])
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(tooltipTexts()).toEqual(['复制'])

    trigger('a').dispatchEvent(new PointerEvent('pointerleave'))
    trigger('b').dispatchEvent(new PointerEvent('pointerenter'))
    await nextTick()
    vi.advanceTimersByTime(0)
    await nextTick()
    expect(tooltipTexts()).toContain('删除')
    wrapper.unmount()
  })

  it('Esc 关闭当前提示', async () => {
    const wrapper = mount(Pair, { attachTo: document.body })
    trigger('a').dispatchEvent(new PointerEvent('pointerenter'))
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(tooltipTexts()).toEqual(['复制'])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(tooltipTexts()).toEqual([])
    wrapper.unmount()
  })

  it('关联命令时在提示里展示该命令的平台化快捷键', async () => {
    const controller = createMockChartController()
    const Host = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        const registry = provideChartCommands(root)
        registry.register(
          createChartCommands({
            controller: () => controller,
            openPalette: vi.fn(),
            toggleFullscreen: vi.fn(),
            openSettings: vi.fn(),
            screenshot: vi.fn(),
          }),
        )
        return () =>
          h('div', { ref: root }, [
            h(BaseTooltip, { content: '放大', command: 'view.zoomIn' }, () =>
              h('button', { id: 'z', 'aria-label': '放大' }),
            ),
          ])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    trigger('z').dispatchEvent(new PointerEvent('pointerenter'))
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(tooltipTexts()).toEqual(['放大Ctrl+↑'])
    wrapper.unmount()
  })
})
