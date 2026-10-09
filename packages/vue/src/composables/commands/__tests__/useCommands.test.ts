// 命令层：快捷键只作用于获得焦点的图表；global 命令交给最近活动的图表；命令面板执行同一命令。
import { createCommandRegistry } from '@363045841yyt/klinechart-core'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import CommandPalette from '../../../components/commands/CommandPalette.vue'
import ShortcutList from '../../../components/commands/ShortcutList.vue'
import { provideChartCommands, useRegisterCommands } from '../useCommands.js'

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
    press(document.body, { key: 'k', ctrlKey: true, metaKey: true })
    press(document.body, { key: 'k', ctrlKey: true })
    press(document.body, { key: 'k', metaKey: true })
    await flush()
    expect(a.pal).not.toHaveBeenCalled()
    expect(b.pal).toHaveBeenCalledOnce()
  })
})

describe('CommandPalette', () => {
  it('searches the registry and runs the selected command through it', async () => {
    const registry = createCommandRegistry({ platform: 'win' })
    const zoom = vi.fn()
    registry.register([
      { id: 'view.zoomIn', group: 'view', title: { zh: '放大', en: 'Zoom in' }, run: zoom },
      {
        id: 'settings.open',
        group: 'general',
        title: { zh: '打开设置', en: 'Open settings' },
        shortcut: 'Mod+,',
        run: vi.fn(),
      },
    ])
    const open = ref(true)
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(CommandPalette, {
            registry,
            open: open.value,
            'onUpdate:open': (value: boolean) => {
              open.value = value
            },
          }),
      }),
      { attachTo: document.body },
    )
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('input[role="combobox"]')!
    expect(input.getAttribute('aria-label')).toBe('搜索命令、设置与品种')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    input.value = 'zoom'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining('放大')])
    ;(options[0] as HTMLElement).click()
    await flushPromises()
    expect(zoom).toHaveBeenCalledOnce()
    expect(open.value).toBe(false)
    wrapper.unmount()
  })
})

describe('ShortcutList', () => {
  it('is generated from the registry', async () => {
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register([
      {
        id: 'drawing.redo',
        group: 'drawing',
        title: { zh: '重做画线', en: 'Redo' },
        shortcut: ['Mod+Shift+Z', 'Mod+Y'],
        run: vi.fn(),
      },
      { id: 'no.shortcut', title: { zh: '无快捷键', en: 'None' }, run: vi.fn() },
    ])
    const wrapper = mount(ShortcutList, { props: { registry } })
    await nextTick()
    expect(wrapper.text()).toContain('重做画线')
    expect(wrapper.text()).toContain('Ctrl+Shift+Z')
    expect(wrapper.text()).toContain('Ctrl+Y')
    expect(wrapper.text()).not.toContain('无快捷键')
  })
})
