import { describe, expect, it, vi } from 'vitest'

import { resolveSettings, type ChartSettings } from '../../../foundation/config/chartSettings'
import { createSettingsState } from '../settingsState'

describe('settingsState', () => {
  it('starts as fully resolved defaults', () => {
    const s = createSettingsState()
    const resolved = resolveSettings({})
    expect(s.readonly.settings.peek().showGridLines).toBe(resolved.showGridLines)
    expect(s.readonly.settings.peek().rightAxisType).toBe(resolved.rightAxisType)
  })

  it('replace merges partial via resolveSettings', () => {
    const s = createSettingsState()
    s.actions.replace({ showGridLines: false })
    expect(s.readonly.settings.peek().showGridLines).toBe(false)
    expect(s.readonly.settings.peek().enableWebGLRendering).toBeDefined()
  })

  it('patch merges onto current then re-resolves', () => {
    const s = createSettingsState()
    s.actions.replace({ showGridLines: false })
    s.actions.patch({ rightAxisType: 'log' })
    expect(s.readonly.settings.peek().showGridLines).toBe(false)
    expect(s.readonly.settings.peek().rightAxisType).toBe('log')
  })

  it('equal-skip does not notify on identical replace', () => {
    const s = createSettingsState()
    s.actions.replace({ showGridLines: true })
    const listener = vi.fn()
    s.readonly.settings.subscribe(listener)
    s.actions.replace({ showGridLines: true })
    expect(listener).not.toHaveBeenCalled()
  })

  it('snapshot is frozen', () => {
    const s = createSettingsState()
    const snap = s.readonly.settings.peek() as ChartSettings
    expect(Object.isFrozen(snap)).toBe(true)
    expect(() => {
      ;(snap as { showGridLines?: boolean }).showGridLines = false
    }).toThrow()
  })
})
