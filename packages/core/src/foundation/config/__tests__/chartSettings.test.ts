import { describe, expect, it } from 'vitest'

import {
  type ChartSettings,
  DEFAULT_SETTINGS,
  loadStoredSettings,
  mapRendererTierToBackend,
  migrateStoredSettings,
  normalizeSettings,
  resolveSettingDefault,
  resolveSettings,
  SETTINGS_STORAGE_KEY,
} from '../chartSettings'

describe('mapRendererTierToBackend', () => {
  it.each([
    ['webgpu', 'webgpu'],
    ['webgl2', 'webgl'],
    ['canvas2d', 'canvas'],
    ['none', 'webgl'],
  ] as const)('maps %s to %s', (tier, backend) => {
    expect(mapRendererTierToBackend(tier)).toBe(backend)
  })
})

describe('resolveSettingDefault', () => {
  it('returns a literal value as-is', () => {
    expect(resolveSettingDefault(true)).toBe(true)
    expect(resolveSettingDefault('dark')).toBe('dark')
    expect(resolveSettingDefault(50)).toBe(50)
  })

  it('invokes a function default and uses its return value', () => {
    expect(resolveSettingDefault(() => 'canvas')).toBe('canvas')
  })
})

describe('rendererBackend default', () => {
  it('is resolved lazily from capability detection', () => {
    const item = DEFAULT_SETTINGS.find((setting) => setting.key === 'rendererBackend')
    expect(typeof item?.default).toBe('function')
    // Node 无 document/navigator.gpu → 探测为 none → 回退 webgl
    expect(resolveSettingDefault(item!.default)).toBe('webgl')
  })
})

describe('normalizeSettings', () => {
  it('defaults to WebGL', () => {
    expect(normalizeSettings().rendererBackend).toBe('webgl')
  })

  it('migrates legacy axis keys into Setting fields', () => {
    expect(migrateStoredSettings({ rightAxisType: 'log', leftAxisType: 'percent' })).toEqual({
      mainRightAxisTypeSetting: 'log',
      mainLeftAxisDisplaySetting: 'percent',
    })
    expect(normalizeSettings({ rightAxisType: 'percent' }).mainRightAxisTypeSetting).toBe('percent')
  })

  it('migrates the old WebGL toggle without retaining it', () => {
    expect(migrateStoredSettings({ enableWebGLRendering: true, showGridLines: false })).toEqual({
      rendererBackend: 'webgl',
      showGridLines: false,
    })
    expect(migrateStoredSettings({ enableWebGLRendering: false })).toEqual({
      rendererBackend: 'canvas',
    })
  })

  it('prefers an existing rendererBackend during migration', () => {
    expect(
      migrateStoredSettings({ rendererBackend: 'webgpu', enableWebGLRendering: false }),
    ).toEqual({ rendererBackend: 'webgpu' })
  })
})

describe('resolveSettings', () => {
  it('lets explicit overrides win per key and keeps stored for the rest', () => {
    const stored: Partial<ChartSettings> = { showGridLines: false, theme: 'light' }
    const resolved = resolveSettings({ showGridLines: true }, stored)
    expect(resolved.showGridLines).toBe(true)
    expect(resolved.theme).toBe('light')
  })

  it('uses stored plus defaults when no overrides are given', () => {
    const resolved = resolveSettings(undefined, { showGridLines: false })
    expect(resolved.showGridLines).toBe(false)
    expect(resolved.rendererBackend).toBe('webgl')
  })

  it('keeps stored keys that the overrides do not declare', () => {
    const stored = {
      colorPresetSettings: { dark: { candleUpBody: '#e85d04' } },
    }
    const resolved = resolveSettings({ showGridLines: true }, stored)
    expect(resolved.colorPresetSettings).toEqual({
      dark: { candleUpBody: '#e85d04' },
    })
  })

  it('treats an explicit undefined override as undeclared', () => {
    const resolved = resolveSettings({ showGridLines: undefined }, { showGridLines: false })
    expect(resolved.showGridLines).toBe(false)
  })

  it('preserves extension keys from overrides', () => {
    expect(resolveSettings({ preClose: 12.34 }, {}).preClose).toBe(12.34)
  })
})

describe('loadStoredSettings', () => {
  it('returns null when storage is empty or missing', () => {
    expect(loadStoredSettings(null)).toBeNull()
    expect(
      loadStoredSettings({
        getItem: () => null,
      }),
    ).toBeNull()
  })

  it('migrates persisted JSON', () => {
    const storage = {
      getItem: (key: string) =>
        key === SETTINGS_STORAGE_KEY
          ? JSON.stringify({ enableWebGLRendering: true, showGridLines: false })
          : null,
    }
    expect(loadStoredSettings(storage)).toEqual({
      rendererBackend: 'webgl',
      showGridLines: false,
    })
  })
})
