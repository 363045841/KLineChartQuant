import { flushPromises, mount } from '@vue/test-utils'
import { createMarketDataHost } from '@363045841yyt/klinechart-core/market-data'
import ChartSettingsDialog from '@vue-src/components/chart/settings/ChartSettingsDialog.vue'
import { MARKET_DATA_CONTEXT_KEY } from '@vue-src/composables/market/useMarketDataContext.js'
import { expect, it, onTestFinished } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import CommandPalette from './CommandPalette.vue'

it('opens chart settings from the command palette', async () => {
  const market = createMarketDataHost()
  onTestFinished(() => market.dispose())
  const settingsOpen = ref(false)
  const paletteOpen = ref(true)
  const wrapper = mount(
    defineComponent({
      setup: () => () => [
        h(ChartSettingsDialog, {
          open: settingsOpen.value,
          initialSection: 'shortcuts',
          effectiveTheme: 'dark',
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
    {
      attachTo: document.body,
      global: { provide: { [MARKET_DATA_CONTEXT_KEY]: market } },
    },
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
