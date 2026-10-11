/** BaseTooltip：首个提示延迟显示，相邻提示即时显示；Esc 关闭；键盘聚焦可触发。 */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import BaseTooltip from '../../components/common/BaseTooltip.vue'
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
})
