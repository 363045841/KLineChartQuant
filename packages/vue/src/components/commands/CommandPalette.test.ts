/** 命令面板：检索命令注册表、选中执行并关闭。 */
import { createCommandRegistry } from '@363045841yyt/klinechart-core'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMockChartController } from '../../__tests__/_mockController.js'
import { createChartCommands } from '../../composables/commands/chartCommands.js'
import CommandPalette from './CommandPalette.vue'

/** 等 BaseModal 的 dialog 打开与一次宏任务。 */
async function flush(): Promise<void> {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

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
    await flush()

    const input = document.querySelector<HTMLInputElement>('.search-field__input')
    expect(input?.getAttribute('aria-label')).toBe('搜索命令')
    // 空查询下两条命令都在，且 settings.open 显示其快捷键。
    const shortcut = document.querySelector('.shortcut-key-group')
    expect(shortcut?.textContent?.replace(/\s+/g, '')).toBe('Ctrl+,')
    input!.value = 'zoom'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent)).toEqual([expect.stringContaining('放大')])
    ;(options[0] as HTMLElement).click()
    await flush()

    expect(zoom).toHaveBeenCalledOnce()
    expect(open.value).toBe(false)

    // 第一次关闭后再次打开，BaseModal 仍应使用父层的 v-model 状态。
    open.value = true
    await flush()
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(true)

    wrapper.unmount()
  })

  it('lists chart commands with their shortcuts when available', async () => {
    const controller = createMockChartController()
    controller._setDrawingHistory(true, true)
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register(createChartCommands({ controller: () => controller, openPalette: vi.fn() }))
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
    await flush()
    const shortcuts = [...document.querySelectorAll('.shortcut-key-group')].map((el) =>
      el.textContent?.replace(/\s+/g, ''),
    )
    expect(shortcuts).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z'])
    wrapper.unmount()
  })

  it('lists unavailable commands as disabled but still shows their shortcuts', async () => {
    const controller = createMockChartController()
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register(createChartCommands({ controller: () => controller, openPalette: vi.fn() }))
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
    await flush()
    const items = [...document.querySelectorAll<HTMLButtonElement>('.command-palette__item')]
    expect(items.map((item) => item.disabled)).toEqual([true, true])
    const shortcuts = [...document.querySelectorAll('.shortcut-key-group')].map((el) =>
      el.textContent?.replace(/\s+/g, ''),
    )
    expect(shortcuts).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z'])
    wrapper.unmount()
  })
})
