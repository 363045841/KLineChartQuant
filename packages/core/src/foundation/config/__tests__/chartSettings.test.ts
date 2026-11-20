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
  it.each([
    { name: '字面量 true', value: true, expected: true },
    { name: '字面量字符串', value: 'dark', expected: 'dark' },
    { name: '字面量数字', value: 50, expected: 50 },
    { name: '函数默认值', value: () => 'canvas', expected: 'canvas' },
  ])('$name 直接作为默认值', ({ value, expected }) => {
    expect(resolveSettingDefault(value)).toBe(expected)
  })

  it('rendererBackend 默认值按能力探测惰性求值', () => {
    const item = DEFAULT_SETTINGS.find((setting) => setting.key === 'rendererBackend')
    expect(typeof item?.default).toBe('function')
    // Node 无 document/navigator.gpu，探测为 none，回退 webgl
    expect(resolveSettingDefault(item!.default)).toBe('webgl')
  })
})

describe('normalizeSettings 默认值', () => {
  it('补齐缺失键：倒计时、WebGL、深色主题', () => {
    const settings = normalizeSettings()
    expect(settings.showLastPriceCountdown).toBe(true)
    expect(settings.rendererBackend).toBe('webgl')
    expect(settings.theme).toBe('dark')
    expect(settings.klineDensity).toBe(KLINE_DENSITY.Standard)
    expect(settings.showTradingDaySeparator).toBe(true)
  })

  it('显式偏好覆盖默认值', () => {
    expect(normalizeSettings({ showLastPriceCountdown: false }).showLastPriceCountdown).toBe(false)
    expect(normalizeSettings({ theme: 'auto' }).theme).toBe('auto')
    expect(normalizeSettings({ theme: 'light' }).theme).toBe('light')
  })

  it('显式 false 与 undefined 的语义不同', () => {
    expect(normalizeSettings({ showGridLines: false }).showGridLines).toBe(false)
    expect(normalizeSettings({ showGridLines: undefined }).showGridLines).toBe(true)
  })

  it('保留调用方的扩展键（如 preClose）', () => {
    expect(normalizeSettings({ preClose: 12.34 }).preClose).toBe(12.34)
  })

  it('保留颜色预设覆盖', () => {
    const resolved = normalizeSettings({
      colorPresetSettings: { dark: { candleUpBody: '#e85d04' } },
    })
    expect(resolved.colorPresetSettings).toEqual({
      dark: { candleUpBody: '#e85d04' },
    })
  })
})

describe('K 线密度', () => {
  it('未设置时使用标准系数', () => {
    expect(resolveKLineGapRatio(undefined)).toBe(KLINE_GAP_RATIOS.standard)
  })

  it.each([
    [KLINE_DENSITY.Compact, 0.3],
    [KLINE_DENSITY.Standard, 0.6],
    [KLINE_DENSITY.Loose, 0.9],
  ] as const)('%s 映射为对应间距系数', (density, ratio) => {
    expect(resolveKLineGapRatio(density)).toBe(ratio)
  })
})

describe('交易分隔', () => {
  it('默认开启，并作为样式分组布尔项暴露', () => {
    const item = DEFAULT_SETTINGS.find((entry) => entry.key === 'showTradingDaySeparator')
    expect(item).toMatchObject({ type: 'boolean', group: 'style', default: true })
    expect(normalizeSettings().showTradingDaySeparator).toBe(true)
  })
})
