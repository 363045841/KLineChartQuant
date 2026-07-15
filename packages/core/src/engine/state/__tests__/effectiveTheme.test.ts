import { describe, expect, it } from 'vitest'

import { ChartStateKernel } from '../chartStateKernel'

function createKernel() {
  return new ChartStateKernel({
    initialOptions: {
      minKWidth: 2,
      maxKWidth: 50,
      zoomLevelCount: 20,
      bottomAxisHeight: 24,
      rightAxisWidth: 60,
      leftAxisWidth: 0,
      yPaddingPx: 8,
      panes: [{ id: 'main', ratio: 1 }],
    },
    initialZoomLevel: 1,
    scheduleDraw: () => {},
  })
}

describe('effectiveTheme', () => {
  it('follows settings.theme when not auto', () => {
    const k = createKernel()
    k.settings.actions.patch({ theme: 'light' })
    expect(k.effectiveTheme$.peek()).toBe('light')
    k.settings.actions.patch({ theme: 'dark' })
    expect(k.effectiveTheme$.peek()).toBe('dark')
    k.dispose()
  })

  it('follows systemTheme when settings.theme is auto', () => {
    const k = createKernel()
    k.settings.actions.patch({ theme: 'auto' })
    k.systemTheme.actions.setSystemTheme('dark')
    expect(k.effectiveTheme$.peek()).toBe('dark')
    k.systemTheme.actions.setSystemTheme('light')
    expect(k.effectiveTheme$.peek()).toBe('light')
    k.dispose()
  })

  it('setTheme action patches settings preference', () => {
    const k = createKernel()
    k.actions.setTheme('light')
    expect(k.settings.readonly.settings.peek().theme).toBe('light')
    expect(k.signals.theme()).toBe('light')
    k.dispose()
  })
})
