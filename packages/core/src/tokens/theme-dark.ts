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
            upLight: 'rgba(255, 80, 100, 0.85)',
            upTick: 'hsl(0, 70%, 60%)',
            downLight: 'rgba(60, 200, 160, 0.85)',
            downTick: 'hsl(150, 50%, 65%)',
            lastPrice: 'rgba(230, 100, 115, 0.95)',
        },
        tagBg: {
            white: 'rgb(40, 40, 55)',
            lightGray: 'rgba(50, 50, 65, 0.92)',
            pureWhite: '#282837',
            transparent: 'transparent',
            active: '#1890ff',
            activeHover: '#40a9ff',
            hover: '#3a3a4a',
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
            ma5: 'rgba(255, 200, 50, 1)',
            ma10: 'rgba(200, 150, 30, 1)',
            ma20: 'rgba(90, 140, 255, 1)',
            ma30: 'rgba(90, 190, 95, 1)',
            ma60: 'rgba(170, 60, 195, 1)',
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
            barUp: '#ff6b6b',
            barUpLight: '#ffb3b3',
            barDown: '#4ecdc4',
            barDownLight: '#a8e6e1',
        },
        rsi: {
            rsi1: 'rgba(90, 140, 255, 1)',
            rsi2: 'rgba(255, 170, 50, 1)',
            rsi3: 'rgba(180, 70, 205, 1)',
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
        },
        mom: {
            mom: 'rgba(90, 140, 255, 1)',
            zero: 'rgba(255, 255, 255, 0.2)',
        },
        wmsr: {
            wmsr: 'rgba(90, 140, 255, 1)',
            overbought: 'rgba(255, 80, 100, 0.6)',
            oversold: 'rgba(60, 200, 160, 0.6)',
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
        wmsrGrid: 'rgba(255, 255, 255, 0.1)',
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
