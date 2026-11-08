// 验证主题选择不覆盖已有明暗、市场方向、用户配色或其它业务设置。
import { THEME_PRESETS } from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import { describe, expect, it } from 'vitest'
import { useThemePresets } from '../useThemePresets.js'

describe('主题选择快照', () => {
  it.each(['light', 'dark', 'auto'] as const)('%s 模式下切换全部风格保留独立偏好', (theme) => {
    const original: ChartSettings = {
      theme,
      isAsiaMarket: true,
      showGridLines: false,
      colorPresetSettings: {
        dark: { candleUpBody: '#123456' },
        light: { ui: { accent: '#654321' } },
      },
    }
    let draft = original
    const picker = useThemePresets(
      () => draft,
      (next) => {
        draft = next
      },
      () => (theme === 'light' ? 'light' : 'dark'),
    )
    for (const preset of THEME_PRESETS) {
      picker.selectPreset(preset)
      expect(draft).toEqual({
        ...original,
        colorPresetSettings: { ...original.colorPresetSettings, preset: preset.id },
      })
      expect(picker.isSelected(preset)).toBe(true)
    }
    expect(original.colorPresetSettings).not.toHaveProperty('preset')
  })

  it('卡片配色使用已生效模式，不跟随未确认的 theme 草稿', () => {
    const picker = useThemePresets(
      () => ({ theme: 'light' }),
      () => {},
      () => 'dark',
    )
    const pro = picker.presets.value.find((preset) => preset.id === 'pro')
    expect(pro?.style['--preset-background']).toBe(
      pro?.schemes.dark.colors.ui.controlBackground,
    )
  })
})
