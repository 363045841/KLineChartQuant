// 生成文件：由 `pnpm tokens:build` 从 src/foundation/tokens/dtcg/scheme/light.tokens.json 生成，请勿手改。
/**
 * Light theme — concrete token values.
 *
 * Color choices:
 *
 *   - Bull (up) = a saturated green (#089981). Clears the WCAG AA non-text
 *     threshold (≥ 3:1) against #FAFAFA at 3.42:1.
 *   - Bear (down) = a saturated red (#f23645). Clears the same threshold at
 *     3.73:1.
 *   - Background = #FAFAFA (slightly off-white, kinder to eyes than pure
 *     #FFFFFF for long sessions).
 *   - Grid major / minor split: major lines for round-number price tiers,
 *     minor for between-tier rhythm. Both very low contrast (1.3:1, 1.1:1)
 *     so they don't dominate.
 *
 * Indicator palette: ten qualitatively distinct hues using the Okabe-Ito
 * colorblind-safe set (extended to ten by adding three desaturated mids).
 * Each WCAG AA against the background (>= 3:1 for non-text).
 */

import { lightInterfaceColors } from './interface-colors.js'
import { motion, spacing, typography } from './theme-base.js'
import type { Theme } from './types.js'

export const lightTheme: Theme = {
  name: 'light',
  spacing,
  typography,
  motion,
  colors: {
    background: lightInterfaceColors.background,
    foreground: lightInterfaceColors.text,
    chartBackground: lightInterfaceColors.background,
    floatingSurface: lightInterfaceColors.surface,
    candleUpBody: '#089981',
    candleUpBorder: '#089981',
    candleUpWick: '#089981',
    candleDownBody: '#f23645',
    candleDownBorder: '#f23645',
    candleDownWick: '#f23645',
    candleDojiBorder: '#6E6E6E',
    performancePositive: '#0B7A50',
    performanceNegative: '#C2363B',
    performanceNeutral: '#5A5A5A',
    volumeUp: '#0F8B5C66', // 40% alpha — paired with candleUp
    volumeDown: '#C2363B66',
    volumeNeutral: '#00000066',
    axisText: lightInterfaceColors.muted,
    axisLine: lightInterfaceColors.border,
    axisTick: lightInterfaceColors.border,
    gridMajor: '#E5E5E5',
    gridMinor: '#F0F0F0',
    crosshairLine: '#8C8C8C',
    crosshairLabelBg: lightInterfaceColors.text,
    crosshairLabelText: lightInterfaceColors.background,
    selectionFill: '#2D7FF933',
    selectionStroke: '#2D7FF9',
    tooltipBg: lightInterfaceColors.surface,
    tooltipText: lightInterfaceColors.text,
    tooltipBorder: lightInterfaceColors.border,
    heatmapColdest: '#F0F4F8',
    heatmapHottest: '#1F3A5F',
    volumeProfileFill: '#9CA3AF66',
    volumeProfilePoc: '#F97316',
    volumeProfileValueArea: '#2D7FF933',
    footprintAsk: '#0F8B5C80',
    footprintBid: '#C2363B80',
    footprintImbalance: '#F97316',
    alertActive: '#2D7FF9',
    // alertTriggered: orange #F97316 was 2.69:1 on white (fails AA
    // non-text). Darkened to #C2410C → 4.13:1.
    alertTriggered: '#C2410C',
    alertMuted: '#9CA3AF',
    avwapLine: '#7C3AED',
    avwapBand: '#7C3AED33',
    // mtfOverlay: sky #0EA5E9 was 2.66:1 on white. Darkened to
    // #0369A1 → 4.59:1.
    mtfOverlay: '#0369A1',
    timeSharePriceLine: '#4A90D9',
    timeShareAvgLine: '#F5A623',
    timeShareAreaUp: 'rgba(15, 139, 92, 0.15)',
    timeShareAreaDown: 'rgba(213, 19, 26, 0.15)',
    timeSharePreClose: '#888888',
    timeShareVolume: '#4A90D9',
    palette: {
      // Okabe-Ito-derived qualitative scale, AA on #FAFAFA
      // strong blue
      i1: '#0072B2',
      i2: '#E69F00', // amber
      i3: '#009E73', // teal-green
      i4: '#CC79A7', // pink
      i5: '#D55E00', // burnt orange
      i6: '#56B4E9', // sky
      i7: '#F0E442', // yellow (use sparingly — low contrast)
      i8: '#7C3AED', // purple
      i9: '#2D7FF9', // blue
      i10: '#6E6E6E', // neutral gray
      indicatorAtr: '#d97706',
    },
    // ── Legacy indicator colours (from engine/theme/colors) ──
    text: {
      primary: lightInterfaceColors.text,
      secondary: lightInterfaceColors.muted,
      tertiary: lightInterfaceColors.textSoft,
      weak: 'hsl(210, 7%, 65%)',
      white: 'rgba(255, 255, 255, 0.92)',
    },
    price: {
      lastPrice: 'rgba(230, 100, 115, 0.95)',
    },
    tagBg: {
      white: lightInterfaceColors.surface,
      lightGray: 'rgba(255, 255, 255, 0.92)',
      pureWhite: lightInterfaceColors.card,
      transparent: 'transparent',
      active: lightInterfaceColors.accent,
      activeHover: lightInterfaceColors.accentStrong,
      hover: lightInterfaceColors.hover,
    },
    border: {
      dark: 'rgba(0, 0, 0, 0.12)',
      medium: 'rgba(0, 0, 0, 0.10)',
      light: 'rgba(0, 0, 0, 0.08)',
      separator: 'rgba(0, 0, 0, 0.10)',
      button: lightInterfaceColors.borderStrong,
      chart: lightInterfaceColors.border,
    },
    ma: {
      ma5: '#e8590c',
      ma10: '#0891b2',
      ma20: '#2563eb',
      ma30: '#2f9e44',
      ma60: '#ae3ec9',
    },
    boll: {
      upper: 'rgba(178, 34, 34, 1)',
      middle: 'rgba(69, 112, 249, 1)',
      lower: 'rgba(34, 139, 34, 1)',
      bandFill: 'rgba(100, 149, 237, 0.1)',
    },
    macd: {
      dif: 'rgba(69, 112, 249, 1)',
      dea: 'rgba(255, 152, 0, 1)',
      // MACD 柱与蜡烛遵循同一涨跌约定（base=Western：多头=绿、空头=红），
      // 这样 withAsiaMarketColors 交换后即为亚洲市场「红涨绿跌」。
      barUp: '#22ab94',
      barUpLight: '#ace5dc',
      barDown: '#ff5252',
      barDownLight: '#fccbcd',
    },
    rsi: {
      rsi1: 'rgba(69, 112, 249, 1)',
      rsi2: 'rgba(255, 152, 0, 1)',
      rsi3: 'rgba(156, 39, 176, 1)',
      guide: 'rgba(0, 0, 0, 0.3)',
    },
    cci: {
      cci: 'rgba(69, 112, 249, 1)',
      overbought: 'rgba(214, 10, 34, 0.5)',
      oversold: 'rgba(3, 123, 102, 0.5)',
    },
    kdj: {
      k: 'rgba(69, 112, 249, 1)',
      d: 'rgba(255, 152, 0, 1)',
      j: 'rgba(156, 39, 176, 1)',
      guide: 'rgba(0, 0, 0, 0.3)',
    },
    mom: {
      mom: 'rgba(69, 112, 249, 1)',
      zero: 'rgba(0, 0, 0, 0.2)',
    },
    wmsr: {
      wmsr: 'rgba(69, 112, 249, 1)',
      overbought: 'rgba(214, 10, 34, 0.5)',
      oversold: 'rgba(3, 123, 102, 0.5)',
      guide: 'rgba(0, 0, 0, 0.3)',
    },
    kst: {
      kst: 'rgba(69, 112, 249, 1)',
      signal: 'rgba(255, 152, 0, 1)',
    },
    expma: {
      fast: 'rgba(255, 152, 0, 1)',
      slow: 'rgba(69, 112, 249, 1)',
    },
    ene: {
      upper: 'rgba(214, 10, 34, 1)',
      middle: 'rgba(69, 112, 249, 1)',
      lower: 'rgba(3, 123, 102, 1)',
    },
    ichimoku: {
      tenkan: 'rgb(128, 25, 34)',
      kijun: 'rgba(69, 112, 249, 1)',
      spanA: 'rgba(3, 123, 102, 1)',
      spanB: '#dc2626',
      chikou: 'rgba(156, 39, 176, 1)',
    },
    fib: {
      l618: '#dc2626',
      l786: '#7c2d12',
    },
    gmma: {
      g8: '#ef4444',
      g10: '#e11d48',
      g50: '#8b5cf6',
      g60: '#6366f1',
    },
    pivot: {
      resistance: '#dc2626',
    },
    label: {
      bg: 'rgba(0, 0, 0, 0.8)',
      text: '#ffffff',
    },
    lastPriceLabel: {
      bg: 'rgba(255, 247, 248, 0.98)',
    },
    volumePrice: {
      riseWith: '#FF4444',
      riseWithout: '#00C853',
      fallWith: '#FF4444',
      fallWithout: '#00C853',
    },
    structure: {
      hh: '#16a34a',
      hl: '#22c55e',
      lh: '#dc2626',
      ll: '#ef4444',
      choch: '#8b5cf6',
      bos: '#f59e0b',
    },
    zones: {
      fvgBullFill: 'rgba(34, 197, 94, 0.15)',
      fvgBearFill: 'rgba(239, 68, 68, 0.15)',
      fvgBullBorder: 'rgba(34, 197, 94, 0.6)',
      fvgBearBorder: 'rgba(239, 68, 68, 0.6)',
      obBullFill: 'rgba(34, 197, 94, 0.25)',
      obBearFill: 'rgba(239, 68, 68, 0.25)',
    },
    referenceLine: {
      neutral: 'rgba(0, 0, 0, 0.3)',
    },
    wmsrGrid: 'rgba(0, 0, 0, 0.1)',
    ui: lightInterfaceColors,
    agent: {
      composerInputBackground: lightInterfaceColors.input,
      composerControlBackground: lightInterfaceColors.controlBackground,
      composerControlHover: lightInterfaceColors.hover,
      userMessage: '#EAEAEE',
      backdrop: 'rgba(0, 0, 0, 0.35)',
      panelShadow: 'rgba(0, 0, 0, 0.2)',
    },
  },
}
