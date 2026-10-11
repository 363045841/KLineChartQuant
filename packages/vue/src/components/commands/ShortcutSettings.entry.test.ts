import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import ChartSettingsDialog from '../ChartSettingsDialog.vue'
import CommandPalette from './CommandPalette.vue'

it('opens chart settings from the command palette', async () => {
  const settingsOpen = ref(false)
  const paletteOpen = ref(true)
  const wrapper = mount(
    defineComponent({
      setup: () => () => [
        h(ChartSettingsDialog, {
          open: settingsOpen.value,
          initialSection: 'shortcuts',
          'onUpdate:open': (value: boolean) => {
            settingsOpen.value = value
          },
        }),
        h(CommandPalette, {
          open: paletteOpen.value,
          'onUpdate:open': (value: boolean) => {
            paletteOpen.value = value
          },
          onOpenShortcuts: () => {
            settingsOpen.value = true
          },
        }),
      ],
    }),
    { attachTo: document.body },
  )
  try {
    await flushPromises()
    document.querySelector<HTMLButtonElement>('[aria-label="快捷键设置"]')!.click()
    await flushPromises()
    expect(settingsOpen.value).toBe(true)
    expect(paletteOpen.value).toBe(false)
    const settingsDialog = [...document.querySelectorAll('dialog')].find((dialog) =>
      dialog.textContent?.includes('图表设置'),
    )
    expect(settingsDialog?.open).toBe(true)
    expect(settingsDialog?.querySelector('.shortcut-settings')).not.toBeNull()
    settingsDialog!.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click()
    await flushPromises()
    paletteOpen.value = true
    await flushPromises()
    document.querySelector<HTMLButtonElement>('[aria-label="快捷键设置"]')!.click()
    await flushPromises()
    expect(
      [...document.querySelectorAll('dialog')].find((dialog) =>
        dialog.textContent?.includes('图表设置'),
      )?.open,
    ).toBe(true)
  } finally {
    wrapper.unmount()
  }
})
