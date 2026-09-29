// 将风格语义色表映射到既有 Token；保持涨跌颜色和业务能力独立。
import { mergeTheme } from '../../mergeTheme.js'
import type { Theme } from '../../types.js'
import type { ThemePresetId, VisualPalette } from '../types.js'

/** 基于深浅主题生成风格变体，指标颜色与界面密度按风格集中定义。 */
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
    return mergeTheme(theme, {
      spacing: { sm: '5px', md: '8px', lg: '12px' },
      typography: { fontSizeSm: '10px', fontSizeMd: '11px', fontSizeLg: '12px' },
      motion: { durationFast: '50ms', durationModerate: '100ms' },
      colors: {
        selectionStroke: base.colors.palette.i1,
        selectionFill: `${base.colors.palette.i1}33`,
      },
    })
  if (id === 'exchange')
    return mergeTheme(theme, { spacing: { sm: '6px', md: '10px', lg: '14px' } })
  if (id === 'zen')
    return mergeTheme(theme, {
      spacing: { sm: '10px', md: '16px', lg: '20px' },
      typography: { fontSizeSm: '11px', fontSizeMd: '14px', fontSizeLg: '16px' },
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
      typography: { fontFamily: base.typography.fontFamilyMono },
    })
  }
  return theme
}
