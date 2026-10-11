/**
 * Vue 命令层桥测试：快捷键只作用于获得焦点的图表；global 命令交给最近活动的
 * 图表；可编辑控件内不触发图表作用域命令。
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import {
  __resetCommandScopesForTest,
  provideChartCommands,
  useRegisterCommands,
} from '../useCommands.js'

/** 构造一张图表宿主：根元素为快捷键作用域，内含一个可聚焦按钮与一个输入框。 */
function chartHost(name: string, onDelete: () => void, onPalette: () => void) {
  return defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      const registry = provideChartCommands(root)
      useRegisterCommands(registry, () => [
        {
          id: 'drawing.delete',
          title: { zh: '删除', en: 'Delete' },
          shortcut: 'Delete',
          run: onDelete,
        },
        {
          id: 'palette.open',
          title: { zh: '命令面板', en: 'Palette' },
          shortcut: 'Mod+K',
          scope: 'global',
          allowInEditable: true,
          run: onPalette,
        },
      ])
      return () =>
        h('div', { ref: root, 'data-chart': name }, [
          h('button', { 'data-focus': name }, name),
          h('input', { 'data-input': name }),
        ])
    },
  })
}

const press = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('chart command scope', () => {
  const wrappers: Array<{ unmount(): void }> = []
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    __resetCommandScopesForTest()
  })

  it('fires Delete only for the chart that owns focus (no document-wide Delete)', async () => {
    const a = { del: vi.fn(), pal: vi.fn() }
    const b = { del: vi.fn(), pal: vi.fn() }
    wrappers.push(mount(chartHost('a', a.del, a.pal), { attachTo: document.body }))
    wrappers.push(mount(chartHost('b', b.del, b.pal), { attachTo: document.body }))

    press(document.querySelector('[data-focus="b"]')!, { key: 'Delete' })
    await flush()
    expect(b.del).toHaveBeenCalledOnce()
    expect(a.del).not.toHaveBeenCalled()

    // 焦点在图表之外：chart 作用域命令不触发。
    press(document.body, { key: 'Delete' })
    await flush()
    expect(a.del).not.toHaveBeenCalled()
    expect(b.del).toHaveBeenCalledOnce()

    // 在输入框内：Delete 不被拦截。
    press(document.querySelector('[data-input="a"]')!, { key: 'Delete' })
    await flush()
    expect(a.del).not.toHaveBeenCalled()
  })

  it('routes global ⌘K to the most recently active chart', async () => {
    const a = { del: vi.fn(), pal: vi.fn() }
    const b = { del: vi.fn(), pal: vi.fn() }
    wrappers.push(mount(chartHost('a', a.del, a.pal), { attachTo: document.body }))
    wrappers.push(mount(chartHost('b', b.del, b.pal), { attachTo: document.body }))

    document
      .querySelector('[data-focus="b"]')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }))
    press(document.body, { key: 'k', ctrlKey: true })
    await flush()
    expect(a.pal).not.toHaveBeenCalled()
    expect(b.pal).toHaveBeenCalledOnce()
  })
})
