// 将风格语义色表映射到既有 Token；预设只调整颜色，保持涨跌颜色和业务能力独立。
import { mergeTheme } from '../../mergeTheme.js'
import type { Theme } from '../../types.js'
import type { ThemePresetId, VisualPalette } from '../types.js'

/** 基于深浅主题生成风格变体；间距、字号、字族与动效一律沿用基础主题。 */
export function createVisualTheme(base: Theme, p: VisualPalette, id: ThemePresetId): Theme {
  const theme: Theme = {
    ...base,
    name: `${id}-${base.name}`,
    colors: {
      ...base.colors,
      background: p.background,
      chartBackground: p.background,
      foreground: p.text,
      floatingSurface: p.surface,
      axisText: p.muted,
      axisLine: p.border,
      axisTick: p.border,
      gridMajor: p.gridMajor,
      gridMinor: p.gridMinor,
      selectionStroke: p.accent,
      selectionFill: `${p.accent}26`,
      crosshairLine: p.muted,
      crosshairLabelBg: p.text,
      crosshairLabelText: p.background,
      tooltipBg: p.surface,
      tooltipText: p.text,
      tooltipBorder: p.borderStrong,
      text: { ...base.colors.text, primary: p.text, secondary: p.muted, tertiary: p.muted },
      tagBg: { ...base.colors.tagBg, active: p.accent, activeHover: p.accent, hover: p.hover },
      border: { ...base.colors.border, button: p.border, chart: p.border, separator: p.border },
      ui: {
        ...base.colors.ui,
        background: p.background,
        surface: p.surface,
        card: p.card,
        input: p.input,
        hover: p.hover,
        selected: p.selected,
        border: p.border,
        borderStrong: p.borderStrong,
        text: p.text,
        textSoft: p.muted,
        muted: p.muted,
        accent: p.accent,
        accentStrong: p.accent,
        focus: p.accent,
        onAccent: p.onAccent,
        controlBackground: p.input,
        secondaryButtonText: p.muted,
      },
      agent: { ...base.colors.agent, userMessage: p.card },
    },
  }
  if (id === 'terminal')
    // 选区改用分类色，避免与高对比边界色混淆。
    return mergeTheme(theme, {
      colors: {
        selectionStroke: base.colors.palette.i1,
        selectionFill: `${base.colors.palette.i1}33`,
      },
    })
  if (id === 'quant') {
    // 常用指标消费已有十色分类色盘，避免仅在预览色样体现差异。
    const palette = base.colors.palette
    return mergeTheme(theme, {
      colors: {
        ma: {
          ma5: palette.i1,
          ma10: palette.i2,
          ma20: palette.i3,
          ma30: palette.i4,
          ma60: palette.i8,
        },
        boll: { ...base.colors.boll, upper: palette.i5, middle: palette.i6, lower: palette.i8 },
        avwapLine: palette.i8,
        avwapBand: `${palette.i8}26`,
        mtfOverlay: palette.i6,
      },
    })
  }
  return theme
}
