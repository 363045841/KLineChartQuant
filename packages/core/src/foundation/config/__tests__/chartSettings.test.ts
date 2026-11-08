import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  KLINE_DENSITY,
  KLINE_GAP_RATIOS,
  mapRendererTierToBackend,
  normalizeSettings,
  resolveKLineGapRatio,
  resolveSettingDefault,
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
  it('defaults countdown on and preserves an explicit off preference', () => {
    expect(normalizeSettings().showLastPriceCountdown).toBe(true)
    expect(normalizeSettings({ showLastPriceCountdown: false }).showLastPriceCountdown).toBe(false)
  })
  it('defaults to WebGL', () => {
    expect(normalizeSettings().rendererBackend).toBe('webgl')
  })

  it('defaults to the original dark base unless a preference is provided', () => {
    expect(normalizeSettings().theme).toBe('dark')
    expect(normalizeSettings({ theme: 'auto' }).theme).toBe('auto')
    expect(normalizeSettings({ theme: 'light' }).theme).toBe('light')
  })
})

describe('K 线密度', () => {
  it('默认标准档，未归一化的设置也回退标准档', () => {
    expect(normalizeSettings().klineDensity).toBe(KLINE_DENSITY.Standard)
    expect(resolveKLineGapRatio(undefined)).toBe(KLINE_GAP_RATIOS.standard)
  })

  it.each([
    [KLINE_DENSITY.Compact, 0.3],
    [KLINE_DENSITY.Standard, 0.6],
    [KLINE_DENSITY.Loose, 0.9],
  ] as const)('%s 解析为对应系数', (density, ratio) => {
    expect(resolveKLineGapRatio(density)).toBe(ratio)
  })
})

describe('normalizeSettings input', () => {
  it('fills omitted keys with defaults', () => {
    const resolved = normalizeSettings({ showGridLines: false })
    expect(resolved.showGridLines).toBe(false)
    expect(resolved.rendererBackend).toBe('webgl')
  })

  it('preserves color preset settings', () => {
    const resolved = normalizeSettings({
      colorPresetSettings: { dark: { candleUpBody: '#e85d04' } },
    })
    expect(resolved.colorPresetSettings).toEqual({
      dark: { candleUpBody: '#e85d04' },
    })
  })

  it('uses defaults for undefined keys', () => {
    expect(normalizeSettings({ showGridLines: undefined }).showGridLines).toBe(true)
  })

  it('preserves extension keys from overrides', () => {
    expect(normalizeSettings({ preClose: 12.34 }).preClose).toBe(12.34)
  })
})
