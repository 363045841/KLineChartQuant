// 将风格语义色表映射到既有 Token；预设只调整颜色，保持涨跌颜色和业务能力独立。
import { mergeTheme } from '../../mergeTheme.js'
import type { Theme } from '../../types.js'
import type { ThemePresetId, VisualPalette } from '../types.js'

/** 基于深浅主题生成风格变体；间距、字号、字族与动效一律沿用基础主题。 */
export function createVisualTheme(base: Theme, p: VisualPalette, id: ThemePresetId): Theme {
  // 十字线标签是轴上的交互控件，不是反相强调块：深色下用控件底色配前景文字，
  // 浅色下用前景底色配背景文字，与基础主题的语义保持一致，避免近白底块压在深色轴上。
  const crosshairChip =
    base.name === 'dark'
      ? { crosshairLabelBg: p.input, crosshairLabelText: p.text }
      : { crosshairLabelBg: p.text, crosshairLabelText: p.background }
  // 浅色沿用固定的 chrome 中性色，深色取预设表面色：标题栏与活动标签共用这一档。
  const surround = base.name === 'dark' ? p.surface : base.colors.ui.surroundBackground
  const theme: Theme = {
    ...base,
    name: `${id}-${base.name}`,
    colors: {
      ...base.colors,
      background: p.background,
      chartBackground: p.background,
      // 图例遮罩跟随画布色，只固定 20% 透明把文字背后的蜡烛压淡。
      legendBackground: `${p.background}CC`,
      floatingSurface: p.surface,
      // 图表浮层控件底：深色必须随预设，否则会与画布脱节并逼出组件级明暗补丁。
      chartNavigationBackground:
        base.name === 'dark' ? p.input : base.colors.chartNavigationBackground,
      axisText: p.muted,
      axisLine: p.border,
      axisTick: p.border,
      gridMajor: p.gridMajor,
      gridMinor: p.gridMinor,
      selectionStroke: p.accent,
      selectionFill: `${p.accent}26`,
      crosshairLine: p.muted,
      ...crosshairChip,
      tooltipBg: p.surface,
      tooltipText: p.text,
      tooltipBorder: p.borderStrong,
      tagBg: { ...base.colors.tagBg, active: p.accent, activeHover: p.accent, hover: p.hover },
      border: { ...base.colors.border, button: p.border, chart: p.border, separator: p.border },
      ui: {
        ...base.colors.ui,
        background: p.background,
        surface: p.surface,
        surroundBackground: surround,
        tabActiveBackground: surround,
        // 浅色下提示与输入同为 #F7F7F7；深色必须抬到控件底才在弹窗表面上可见，随预设派生。
        noticeBackground: base.name === 'dark' ? p.input : base.colors.ui.noticeBackground,
        inputBackground: base.name === 'dark' ? p.input : base.colors.ui.inputBackground,
        card: p.card,
        input: p.input,
        hover: p.hover,
        selected: p.selected,
        border: p.border,
        borderStrong: p.borderStrong,
        accent: p.accent,
        accentStrong: p.accent,
        focus: p.accent,
        onAccent: p.onAccent,
        popover: base.name === 'dark' ? p.card : base.colors.ui.popover,
        controlBackground: p.input,
      },
      agent: {
        ...base.colors.agent,
        userMessage: p.card,
        composerControlBackground:
          base.name === 'dark' ? p.input : base.colors.agent.composerControlBackground,
        composerControlHover:
          base.name === 'dark' ? p.hover : base.colors.agent.composerControlHover,
      },
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
