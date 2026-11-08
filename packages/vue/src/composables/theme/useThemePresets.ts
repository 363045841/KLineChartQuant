// 视觉风格选择仅生成设置快照，不改动明暗、市场方向或用户颜色覆盖。
import {
  DEFAULT_THEME_PRESET,
  THEME_PRESETS,
  type ThemePreset,
} from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import { computed } from 'vue'

/** 卡片使用已生效的明暗模式 Token；设置草稿里未确认的明暗不参与预览。 */
export function useThemePresets(
  getSettings: () => ChartSettings,
  update: (settings: ChartSettings) => void,
  getEffectiveTheme: () => 'light' | 'dark',
) {
  const presets = computed(() =>
    THEME_PRESETS.map((preset) => {
      const colors = preset.schemes[getEffectiveTheme()].colors
      return {
        ...preset,
        style: {
          // 卡片是控件而不是图表缩略图：用控件底色，避免浅色下整块纯白、深色下整块纯黑。
          '--preset-background': colors.ui.controlBackground,
          '--preset-text': colors.ui.text,
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
