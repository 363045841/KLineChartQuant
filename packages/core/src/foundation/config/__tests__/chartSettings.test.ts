import { describe, expect, it } from 'vitest'

import {
  loadStoredSettings,
  migrateStoredSettings,
  resolveRuntimeSettings,
  resolveSettings,
  SETTINGS_STORAGE_KEY,
} from '../chartSettings'

describe('chart renderer settings', () => {
  it('defaults to WebGL', () => {
    expect(resolveSettings().rendererBackend).toBe('webgl')
  })

  it('migrates legacy axis keys into Setting fields', () => {
    expect(migrateStoredSettings({ rightAxisType: 'log', leftAxisType: 'percent' })).toEqual({
      mainRightAxisTypeSetting: 'log',
      mainLeftAxisDisplaySetting: 'percent',
    })
    expect(resolveSettings({ rightAxisType: 'percent' }).mainRightAxisTypeSetting).toBe('percent')
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

describe('resolveRuntimeSettings', () => {
  it('uses prop as sole authority and drops stored ghost fields', () => {
    const stored = {
      showGridLines: false,
      colorPresetSettings: {
        dark: { candleUpBody: '#e85d04' },
      },
    }
    const resolved = resolveRuntimeSettings({ showGridLines: true, theme: 'dark' }, stored)
    expect(resolved.showGridLines).toBe(true)
    expect(resolved.theme).toBe('dark')
    expect(resolved.colorPresetSettings).toEqual({})
  })

  it('treats empty prop object as authority over stored', () => {
    const resolved = resolveRuntimeSettings(
      {},
      { colorPresetSettings: { dark: { candleUpBody: '#e85d04' } } },
    )
    expect(resolved.colorPresetSettings).toEqual({})
  })

  it('falls back to stored when prop is omitted', () => {
    const resolved = resolveRuntimeSettings(undefined, {
      showGridLines: false,
      colorPresetSettings: { dark: { candleUpBody: '#e85d04' } },
    })
    expect(resolved.showGridLines).toBe(false)
    expect(resolved.colorPresetSettings).toEqual({
      dark: { candleUpBody: '#e85d04' },
    })
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
