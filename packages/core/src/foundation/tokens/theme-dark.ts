/**
 * Dark theme — paired with {@link lightTheme}.
 *
 * Color choices:
 *
 *   - Background = #0E1116 (deep but not pure black — pure black creates
 *     halation around bright lines on OLED).
 *   - Bull = brighter green (#22D69B) — needed on dark background for
 *     7.5:1 contrast (passes WCAG AAA for non-text).
 *   - Bear = brighter red (#FF6464) — 6.2:1 contrast.
 *   - Grid is barely visible (1.2:1 over background) so it never competes
 *     with the data.
 *   - Indicator palette is the same Okabe-Ito set but with the few hues
 *     that need a brightness bump on dark background pre-tuned.
 *
 * Same shape as light — only values change. The parity test in
 * `__tests__/themes.test.ts` enforces this.
 */

import { spacing, typography, motion } from './theme-base'
import type { Theme } from './types'

export const darkTheme: Theme = {
  name: 'dark',
  spacing,
  typography,
  motion,
  colors: {
    background: '#111827',
    foreground: '#E8EAED',
    chartBackground: '#111827',

    candleUpBody: '#22D69B',
    candleUpBorder: '#22D69B',
    candleUpWick: '#22D69B',
    candleDownBody: '#FF6464',
    candleDownBorder: '#FF6464',
    candleDownWick: '#FF6464',
    candleDojiBorder: '#8A8F98',

    performancePositive: '#22D69B',
    performanceNegative: '#FF6464',
    performanceNeutral: '#9AA0A6',

    volumeUp: '#22D69B66',
    volumeDown: '#FF646466',
    volumeNeutral: '#FFFFFF66',

    axisText: '#9AA0A6',
    axisLine: '#2A2F36',
    axisTick: '#2A2F36',

    gridMajor: '#2A3547',
    gridMinor: '#202A39',

    crosshairLine: '#686C72',
    crosshairLabelBg: '#E8EAED',
    crosshairLabelText: '#0E1116',

    selectionFill: '#4A9EFF33',
    selectionStroke: '#4A9EFF',

    tooltipBg: '#1B1F26EE',
    tooltipText: '#E8EAED',
    tooltipBorder: '#2A2F36',

    heatmapColdest: '#0E1116',
    heatmapHottest: '#80B7FF',
    volumeProfileFill: '#6B727A66',
    volumeProfilePoc: '#FFA94D',
    volumeProfileValueArea: '#4A9EFF33',
    footprintAsk: '#22D69B80',
    footprintBid: '#FF646480',
    footprintImbalance: '#FFA94D',

    alertActive: '#4A9EFF',
    alertTriggered: '#FFA94D',
    alertMuted: '#6B727A',

    avwapLine: '#A78BFA',
    avwapBand: '#A78BFA33',
    mtfOverlay: '#38BDF8',

    timeSharePriceLine: '#60A5FA',
    timeShareAvgLine: '#FBBF24',
    timeShareAreaUp: 'rgba(34, 214, 155, 0.20)',
    timeShareAreaDown: 'rgba(255, 100, 100, 0.20)',
    timeSharePreClose: '#9CA3AF',
    timeShareVolume: '#60A5FA',

    palette: {
      // Same hue ordering as light theme; values tuned for dark BG.
      i1: '#4A9EFF', // blue (brightened)
      i2: '#FFB95A', // amber
      i3: '#22D69B', // teal-green
      i4: '#E879BA', // pink
      i5: '#FF8848', // burnt orange
      i6: '#7DD3FC', // sky
      i7: '#FCE96A', // yellow
      i8: '#A78BFA', // purple
      i9: '#60A5FA', // blue
      i10: '#9AA0A6', // neutral gray
      indicatorAtr: '#F59E0B',
    },

    // ── Legacy indicator colours (from engine/theme/colors) ──
    text: {
      primary: 'hsl(210, 10%, 85%)',
      secondary: 'hsl(210, 8%, 75%)',
      tertiary: 'hsl(210, 6%, 60%)',
      weak: 'hsl(210, 5%, 45%)',
      white: 'rgba(255, 255, 255, 0.95)',
    },
    price: {
      lastPrice: 'rgba(230, 100, 115, 0.95)',
    },
    tagBg: {
      white: 'rgb(40, 40, 55)',
      lightGray: 'rgba(50, 50, 65, 0.92)',
      pureWhite: '#282837',
      transparent: 'transparent',
      active: '#1890ff',
      activeHover: '#40a9ff',
      // 相对 background #111827 提高悬停对比，列表项 hover 更易辨认
      hover: '#2D3544',
    },
    border: {
      dark: 'rgba(255, 255, 255, 0.15)',
      medium: 'rgba(255, 255, 255, 0.12)',
      light: 'rgba(255, 255, 255, 0.08)',
      separator: 'rgba(255, 255, 255, 0.10)',
      button: '#505060',
      chart: '#3A4048',
    },
    ma: {
      ma5: '#e8590c',
      ma10: '#0891b2',
      ma20: '#2563eb',
      ma30: '#2f9e44',
      ma60: '#ae3ec9',
    },
    boll: {
      upper: 'rgba(200, 60, 60, 1)',
      middle: 'rgba(90, 140, 255, 1)',
      lower: 'rgba(50, 170, 60, 1)',
      bandFill: 'rgba(120, 170, 255, 0.15)',
    },
    macd: {
      dif: 'rgba(90, 140, 255, 1)',
      dea: 'rgba(255, 170, 50, 1)',
      // MACD 柱与蜡烛遵循同一涨跌约定（base=Western：多头=绿、空头=红），
      // 这样 withAsiaMarketColors 交换后即为亚洲市场「红涨绿跌」。
      barUp: '#4ecdc4',
      barUpLight: '#a8e6e1',
      barDown: '#ff6b6b',
      barDownLight: '#ffb3b3',
    },
    rsi: {
      rsi1: 'rgba(90, 140, 255, 1)',
      rsi2: 'rgba(255, 170, 50, 1)',
      rsi3: 'rgba(180, 70, 205, 1)',
      guide: 'rgba(255, 255, 255, 0.3)',
    },
    cci: {
      cci: 'rgba(90, 140, 255, 1)',
      overbought: 'rgba(255, 80, 100, 0.6)',
      oversold: 'rgba(60, 200, 160, 0.6)',
    },
    kdj: {
      k: 'rgba(90, 140, 255, 1)',
      d: 'rgba(255, 170, 50, 1)',
      j: 'rgba(180, 70, 205, 1)',
      guide: 'rgba(255, 255, 255, 0.3)',
    },
    mom: {
      mom: 'rgba(90, 140, 255, 1)',
      zero: 'rgba(255, 255, 255, 0.2)',
    },
    wmsr: {
      wmsr: 'rgba(90, 140, 255, 1)',
      overbought: 'rgba(255, 80, 100, 0.6)',
      oversold: 'rgba(60, 200, 160, 0.6)',
      guide: 'rgba(255, 255, 255, 0.3)',
    },
    kst: {
      kst: 'rgba(90, 140, 255, 1)',
      signal: 'rgba(255, 170, 50, 1)',
    },
    expma: {
      fast: 'rgba(255, 170, 50, 1)',
      slow: 'rgba(90, 140, 255, 1)',
    },
    ene: {
      upper: 'rgba(255, 80, 100, 1)',
      middle: 'rgba(90, 140, 255, 1)',
      lower: 'rgba(60, 200, 160, 1)',
      bandFill: 'rgba(90, 140, 255, 0.12)',
    },
    ichimoku: {
      tenkan: 'rgb(224, 96, 86)',
      kijun: 'rgba(90, 140, 255, 1)',
      spanA: 'rgba(60, 200, 160, 1)',
      spanB: '#dc2626',
      chikou: 'rgba(180, 70, 205, 1)',
    },
    fib: {
      l618: '#f87171',
      l786: '#d97706',
    },
    gmma: {
      g8: '#f87171',
      g10: '#fb7185',
      g50: '#a78bfa',
      g60: '#818cf8',
    },
    pivot: {
      resistance: '#f87171',
    },
    label: {
      bg: 'rgba(30, 30, 40, 0.9)',
      text: '#ffffff',
    },
    lastPriceLabel: {
      bg: 'rgba(60, 50, 55, 0.98)',
    },
    volumePrice: {
      riseWith: '#FF6666',
      riseWithout: '#66FF99',
      fallWith: '#FF6666',
      fallWithout: '#66FF99',
    },
    structure: {
      hh: '#4ade80',
      hl: '#22c55e',
      lh: '#f87171',
      ll: '#ef4444',
      choch: '#a78bfa',
      bos: '#fbbf24',
    },
    zones: {
      fvgBullFill: 'rgba(74, 222, 128, 0.20)',
      fvgBearFill: 'rgba(248, 113, 113, 0.20)',
      fvgBullBorder: 'rgba(74, 222, 128, 0.8)',
      fvgBearBorder: 'rgba(248, 113, 113, 0.8)',
      obBullFill: 'rgba(74, 222, 128, 0.35)',
      obBearFill: 'rgba(248, 113, 113, 0.35)',
    },
    referenceLine: {
      neutral: 'rgba(255, 255, 255, 0.3)',
    },
    wmsrGrid: 'rgba(255, 255, 255, 0.1)',
    agent: {
      background: '#151A1D',
      surface: '#1B2125',
      card: '#20272B',
      input: '#232B30',
      hover: '#2A3338',
      userMessage: '#17312E',
      border: '#323C41',
      borderStrong: '#526169',
      text: '#EDF2F3',
      textSoft: '#839198',
      muted: '#A4B0B5',
      accent: '#2D948A',
      accentStrong: '#247C74',
      focus: '#48B0A6',
      warningBackground: '#302717',
      warningBorder: '#8F681D',
      warningText: '#E6B85C',
      warningStrong: '#B9822B',
      dangerBackground: '#351D1F',
      dangerBorder: '#A94F55',
      dangerText: '#FF8585',
      success: '#45C58E',
      warning: '#F0B44C',
      danger: '#FF7373',
      neutral: '#839198',
      onAccent: '#FFFFFF',
      launcherBorder: '#526169',
      launcherBackground: 'rgba(27, 33, 37, 0.94)',
      backdrop: 'rgba(15, 20, 25, 0.35)',
      panelShadow: 'rgba(0, 0, 0, 0.2)',
    },
  },
}
