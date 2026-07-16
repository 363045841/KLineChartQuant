import { describe, expect, it } from 'vitest'

import { migrateStoredSettings, resolveSettings } from '../chartSettings'

describe('chart renderer settings', () => {
  it('defaults to WebGL', () => {
    expect(resolveSettings().rendererBackend).toBe('webgl')
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
