// 覆盖五风格 × 两种明暗 × 两种市场方向，验证持久化、用户覆盖优先级与“预设只改颜色”。
import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '../../../config/chartSettings.js'
import { normalizeColorPresetSettings } from '../../colorPresetSettings.js'
import { resolveTheme, resolveThemeColors, withAsiaMarketColors } from '../../theme-china.js'
import { darkTheme } from '../../theme-dark.js'
import { lightTheme } from '../../theme-light.js'
import { themeToCssVars } from '../../themeToCssVars.js'
import { THEME_PRESETS } from '../impl/themePresets.js'

const cases = THEME_PRESETS.flatMap((preset) =>
  (['light', 'dark'] as const).flatMap((mode) =>
    [false, true].map((asia) => ({ preset, mode, asia })),
  ),
)

describe('独立主题维度', () => {
  it.each(cases)(
    '$preset.id / $mode / asia=$asia 序列化后保持行情方向和界面风格',
    ({ preset, mode, asia }) => {
      const settings = normalizeSettings({
        theme: mode,
        isAsiaMarket: asia,
        colorPresetSettings: { preset: preset.id },
      })
      const restored = normalizeSettings(JSON.parse(JSON.stringify(settings)))
      expect(restored).toEqual(settings)
      const theme = resolveTheme(mode, asia, restored.colorPresetSettings)
      const base = mode === 'dark' ? darkTheme : lightTheme
      const expected = asia ? withAsiaMarketColors(base) : base
      for (const key of [
        'candleUpBody',
        'candleDownBody',
        'volumeUp',
        'volumeDown',
        'performancePositive',
        'performanceNegative',
      ] as const) {
        expect(theme.colors[key]).toBe(expected.colors[key])
      }
      expect(theme.colors.macd).toEqual(expected.colors.macd)
      const css = themeToCssVars(theme)
      expect(css['--klc-color-ui-accent']).toBe(preset.schemes[mode].colors.ui.accent)
      expect(css['--klc-color-chart-background']).toBe(theme.colors.chartBackground)
      expect(css['--klc-typography-font-size-md']).toBe(base.typography.fontSizeMd)
      expect(theme.colors).not.toHaveProperty('preset')
    },
  )

  it.each(THEME_PRESETS)('$id 只调整配色，间距、字号与动效沿用基础主题', (preset) => {
    for (const mode of ['light', 'dark'] as const) {
      const base = mode === 'dark' ? darkTheme : lightTheme
      expect(preset.schemes[mode].spacing).toEqual(base.spacing)
      expect(preset.schemes[mode].typography).toEqual(base.typography)
      expect(preset.schemes[mode].motion).toEqual(base.motion)
    }
  })

  it('Pro 默认深色完整复用项目原版，浅色保留 Paper 基底', () => {
    expect(normalizeSettings().theme).toBe('dark')
    expect(resolveTheme('dark')).toEqual(darkTheme)
    expect(resolveTheme('light')).toEqual(lightTheme)
  })

  it('过滤已删除的预设和旧嵌套标识，保留手动颜色', () => {
    expect(
      normalizeColorPresetSettings({
        preset: 'tradingview',
        light: { preset: 'tonghuashun', axisText: '#123456' },
      }),
    ).toEqual({ light: { axisText: '#123456' } })
  })

  it.each(THEME_PRESETS)('$id 切换明暗和市场后仍让用户颜色覆盖优先', (preset) => {
    const settings = normalizeColorPresetSettings({
      preset: preset.id,
      dark: { candleUpBody: '#123456', ui: { accent: '#654321' } },
    })
    const colors = resolveThemeColors('dark', true, settings)
    expect(colors.candleUpBody).toBe('#123456')
    expect(colors.ui.accent).toBe('#654321')
    expect(resolveThemeColors('light', false, settings)).toEqual(preset.schemes.light.colors)
    expect(preset.schemes.dark.colors.ui.accent).not.toBe('#654321')
    expect(resolveThemeColors('dark')).toBe(darkTheme.colors)
  })
})
