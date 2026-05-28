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

import type { Theme } from './types'

export const darkTheme: Theme = {
    name: 'dark',
    colors: {
        background: '#0E1116',
        foreground: '#E8EAED',

        candleUpBody: '#22D69B',
        candleUpBorder: '#22D69B',
        candleUpWick: '#22D69B',
        candleDownBody: '#FF6464',
        candleDownBorder: '#FF6464',
        candleDownWick: '#FF6464',
        candleDojiBorder: '#8A8F98',

        volumeUp: '#22D69B66',
        volumeDown: '#FF646466',

        axisText: '#9AA0A6',
        axisLine: '#2A2F36',
        axisTick: '#2A2F36',

        gridMajor: '#1B1F26',
        gridMinor: '#161A20',

        crosshairLine: '#5F6368',
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
        },
    },
    spacing: {
        none: '0',
        xxs: '2px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        xxl: '32px',
        xxxl: '64px',
    },
    typography: {
        fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        fontFamilyMono:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
        fontSizeSm: '10px',
        fontSizeMd: '12px',
        fontSizeLg: '14px',
        fontWeightRegular: 400,
        fontWeightMedium: 500,
        fontWeightBold: 700,
        lineHeightTight: 1.2,
        lineHeightStandard: 1.4,
    },
    motion: {
        durationInstant: '0ms',
        durationFast: '120ms',
        durationModerate: '200ms',
        easingStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easingDecelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    },
}
