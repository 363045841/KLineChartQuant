import { describe, expect, it } from 'vitest'

import { createTestChartStateKernel } from './helpers/createTestChartStateKernel'

describe('effectiveTheme', () => {
  it('follows settings.theme when not auto', () => {
    const k = createTestChartStateKernel()
    k.settings.actions.patch({ theme: 'light' })
    expect(k.effectiveTheme$.peek()).toBe('light')
    k.settings.actions.patch({ theme: 'dark' })
    expect(k.effectiveTheme$.peek()).toBe('dark')
    k.dispose()
  })

  it('follows systemTheme when settings.theme is auto', () => {
    const k = createTestChartStateKernel()
    k.settings.actions.patch({ theme: 'auto' })
    k.systemTheme.actions.setSystemTheme('dark')
    expect(k.effectiveTheme$.peek()).toBe('dark')
    k.systemTheme.actions.setSystemTheme('light')
    expect(k.effectiveTheme$.peek()).toBe('light')
    k.dispose()
  })

  it('setTheme action patches settings preference', () => {
    const k = createTestChartStateKernel()
    k.actions.setTheme('light')
    expect(k.settings.readonly.settings.peek().theme).toBe('light')
    expect(k.signals.theme()).toBe('light')
    k.dispose()
  })
})
