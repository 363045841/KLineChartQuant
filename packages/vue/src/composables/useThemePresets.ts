// 视觉风格选择仅生成设置快照，不改动明暗、市场方向或用户颜色覆盖。
import {
  DEFAULT_THEME_PRESET,
  THEME_PRESETS,
  type ThemePreset,
} from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import { computed } from 'vue'

/** 卡片使用所选明暗模式的 Token；auto 模式用默认深色缩略样式。 */
export function useThemePresets(
  getSettings: () => ChartSettings,
  update: (settings: ChartSettings) => void,
) {
  const presets = computed(() =>
    THEME_PRESETS.map((preset) => {
      const colors = preset.schemes[getSettings().theme === 'light' ? 'light' : 'dark'].colors
      return {
        ...preset,
        style: {
          '--preset-background': colors.chartBackground,
          '--preset-text': colors.ui.text,
          '--preset-muted': colors.ui.muted,
          '--preset-border': colors.ui.border,
          '--preset-accent': colors.ui.accent,
          '--preset-indicator': colors.palette.i8,
        },
      }
    }),
  )

  /** 缺少预设时显示原版 Pro，与 Core 默认解析一致。 */
  function isSelected(preset: ThemePreset): boolean {
    return (getSettings().colorPresetSettings?.preset ?? DEFAULT_THEME_PRESET) === preset.id
  }

  /** 沿用完整快照更新和保存链路；三个维度互不覆盖。 */
  function selectPreset(preset: ThemePreset): void {
    const settings = getSettings()
    update({
      ...settings,
      colorPresetSettings: { ...settings.colorPresetSettings, preset: preset.id },
    })
  }
  return { presets, isSelected, selectPreset }
}
