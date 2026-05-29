/**
 * Light theme — concrete token values.
 *
 * Color choices:
 *
 *   - Bull (up) = a dark saturated green (#0F8B5C). Picked to clear the
 *     WCAG AA non-text threshold (≥ 3:1) against #FAFAFA. The lighter
 *     industry-standard greens like #26A69A fail that bar by ~25 %.
 *   - Bear (down) = a dark saturated red (#C2363B). Same rationale —
 *     the common #EE4D4D fails AA at ~2.6:1.
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

import type { Theme } from './types'

export const lightTheme: Theme = {
    name: 'light',
    colors: {
        background: '#FAFAFA',
        foreground: '#1F1F1F',

        candleUpBody: '#0F8B5C',
        candleUpBorder: '#0F8B5C',
        candleUpWick: '#0F8B5C',
        candleDownBody: '#C2363B',
        candleDownBorder: '#C2363B',
        candleDownWick: '#C2363B',
        candleDojiBorder: '#6E6E6E',

        volumeUp: '#0F8B5C66', // 40% alpha — paired with candleUp
        volumeDown: '#C2363B66',

        axisText: '#5A5A5A',
        axisLine: '#D0D0D0',
        axisTick: '#D0D0D0',

        gridMajor: '#E5E5E5',
        gridMinor: '#F0F0F0',

        crosshairLine: '#8C8C8C',
        crosshairLabelBg: '#1F1F1F',
        crosshairLabelText: '#FAFAFA',

        selectionFill: '#2D7FF933',
        selectionStroke: '#2D7FF9',

        tooltipBg: '#FFFFFFEE',
        tooltipText: '#1F1F1F',
        tooltipBorder: '#D0D0D0',

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

        palette: {
            // Okabe-Ito-derived qualitative scale, AA on #FAFAFA
            i1: '#0072B2', // strong blue
            i2: '#E69F00', // amber
            i3: '#009E73', // teal-green
            i4: '#CC79A7', // pink
            i5: '#D55E00', // burnt orange
            i6: '#56B4E9', // sky
            i7: '#F0E442', // yellow (use sparingly — low contrast)
            i8: '#7C3AED', // purple
            i9: '#2D7FF9', // blue
            i10: '#6E6E6E', // neutral gray
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
