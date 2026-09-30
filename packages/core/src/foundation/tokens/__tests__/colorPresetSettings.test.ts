// 验证主题覆盖的兼容性、嵌套合并和实例隔离。
import { describe, expect, it } from 'vitest'
import { normalizeColorPresetSettings } from '../colorPresetSettings.js'
import { resolveThemeColors } from '../theme-china.js'
import { darkTheme } from '../theme-dark.js'
import { lightTheme } from '../theme-light.js'
import { themeToCssVars } from '../themeToCssVars.js'

describe('语义主题覆盖', () => {
  it('保留原有图表字段，并过滤嵌套 UI 的未知字段与空值', () => {
    expect(
      normalizeColorPresetSettings({
        light: {
          candleUpBody: '#123456',
          axisText: 12,
          unknown: '#fff',
          ui: { text: '#abcdef', input: ' ', unknown: '#fff' },
        },
        dark: { ui: {} },
        other: { chartBackground: '#fff' },
      }),
    ).toEqual({ light: { candleUpBody: '#123456', ui: { text: '#abcdef' } } })
  })

  it.each([null, [], 'invalid', { light: [] }, { dark: { ui: [] } }])(
    '拒绝非法配置 %j',
    (value) => {
      expect(normalizeColorPresetSettings(value)).toEqual({})
    },
  )

  it('同一份设置生成渲染器颜色和 CSS，同时保留未覆盖的 UI Token', () => {
    const settings = { light: { chartBackground: '#123456', ui: { text: '#abcdef' } } }
    const colors = resolveThemeColors('light', false, settings)
    const css = themeToCssVars({ ...lightTheme, colors })
    expect(colors.chartBackground).toBe(css['--klc-color-chart-background'])
    expect(css['--klc-color-ui-text']).toBe('#abcdef')
    expect(colors.ui.border).toBe(lightTheme.colors.ui.border)
    expect(lightTheme.colors.ui.text).not.toBe('#abcdef')
    expect(resolveThemeColors('light', false).ui).toEqual(lightTheme.colors.ui)
  })

  it('深浅覆盖和重置不跨主题，亚洲涨跌规则仍然先于显式覆盖', () => {
    const settings = { light: { candleUpBody: '#123456' }, dark: { ui: { text: '#abcdef' } } }
    expect(resolveThemeColors('light', true, settings).candleUpBody).toBe('#123456')
    expect(resolveThemeColors('dark', false, settings).candleUpBody).toBe(
      darkTheme.colors.candleUpBody,
    )
    const reset = normalizeColorPresetSettings({ ...settings, light: {} })
    expect(resolveThemeColors('light', false, reset)).toBe(lightTheme.colors)
    expect(resolveThemeColors('dark', false, reset).ui.text).toBe('#abcdef')
  })
})
