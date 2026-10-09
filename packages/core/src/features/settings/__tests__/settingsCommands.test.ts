import { describe, expect, it, vi } from 'vitest'
import {
  createSettingsCommands,
  resolveSettingDefaults,
  SettingsCommands,
} from '@/features/settings/settingsCommands'
import { getRegisteredChartTools } from '@/foundation/agent/chartToolRegistry'
import { type ChartSettings, normalizeSettings } from '@/foundation/config/chartSettings'
import { createSignal } from '@/foundation/reactivity/index'

function setup(initial: Partial<ChartSettings> = {}) {
  const settings = createSignal<Readonly<ChartSettings>>(normalizeSettings(initial))
  const apply = vi.fn((patch: Partial<ChartSettings>) => {
    settings.set(normalizeSettings({ ...settings.peek(), ...patch }))
  })
  return { settings, apply, commands: createSettingsCommands({ settings, apply }) }
}

const context = { signal: new AbortController().signal, progress: () => {} }

describe('SettingsCommands', () => {
  it('registers settings_get / settings_update / settings_reset as chart tools on the same class', () => {
    const { commands } = setup()
    const names = ['settings_get', 'settings_update', 'settings_reset']
    for (const name of names) {
      const tool = getRegisteredChartTools().find((candidate) => candidate.config.name === name)
      expect(tool, name).toBeDefined()
      expect(tool?.owns(commands)).toBe(true)
    }
  })

  it('applies only changed keys and returns previous values for undo', async () => {
    const { commands, apply, settings } = setup({ showGridLines: true, theme: 'dark' })
    const result = await commands.updateSettings({
      values: { showGridLines: false, theme: 'dark' },
    })
    expect(result).toEqual({ changed: ['showGridLines'], previous: { showGridLines: true } })
    expect(apply).toHaveBeenCalledWith({ showGridLines: false })
    expect(settings.peek().showGridLines).toBe(false)
  })

  it('does not call apply when nothing changes', async () => {
    const { commands, apply } = setup({ showGridLines: true })
    await commands.updateSettings({ values: { showGridLines: true } })
    expect(apply).not.toHaveBeenCalled()
  })

  it('rejects unknown keys and invalid values with actionable messages', () => {
    const { commands, apply } = setup()
    expect(() => commands.applyValues({ nope: 1 })).toThrow(/unknown setting "nope"/)
    expect(() => commands.applyValues({ theme: 'purple' })).toThrow(/theme must be one of/)
    expect(() => commands.applyValues({ showGridLines: 'yes' })).toThrow(/boolean/)
    expect(() => commands.applyValues({ marketDataCacheMaxMiB: 1 })).toThrow(/>= 5/)
    expect(apply).not.toHaveBeenCalled()
  })

  it('resets the given keys to defaults and reports previous values', async () => {
    const { commands, settings } = setup({ showGridLines: false, theme: 'light' })
    const result = await commands.resetSettings({ keys: ['showGridLines'] })
    expect(result.previous).toEqual({ showGridLines: false })
    expect(settings.peek().showGridLines).toBe(true)
    expect(settings.peek().theme).toBe('light')
  })

  it('resets colour overrides to an empty object', () => {
    expect(resolveSettingDefaults(['colorPresetSettings'])).toEqual({ colorPresetSettings: {} })
  })

  it('executes through the tool registry exactly like the UI call', async () => {
    const { commands, settings } = setup({ showGridLines: true })
    const tool = getRegisteredChartTools().find((c) => c.config.name === 'settings_update')!
    await tool.execute(commands, { values: { showGridLines: false } }, context)
    expect(settings.peek().showGridLines).toBe(false)
    const snapshot = (await getRegisteredChartTools()
      .find((c) => c.config.name === 'settings_get')!
      .execute(commands, {}, context)) as Awaited<ReturnType<SettingsCommands['getSettings']>>
    expect(snapshot.values.showGridLines).toBe(false)
    expect(snapshot.schema.find((item) => item.key === 'theme')?.options).toContain('auto')
  })
})
