/**
 * Asia-market (Chinese) colour convention helper.
 *
 * Asian markets traditionally use **red for "up"** (bull) and **green
 * for "down"** (bear) — the reverse of the Western convention.
 *
 * {@link withAsiaMarketColors} takes any {@link Theme} and returns a new
 * Theme with all bull/bear colour pairs swapped, so the caller only needs
 * a single boolean (`isAsiaMarket`) to switch conventions at runtime.
 *
 * {@link resolveThemeColors} is a convenience for renderers that currently
 * hard-code `theme === 'dark' ? darkTheme.colors : lightTheme.colors`.
 *
 * Usage:
 * ```ts
 * import { resolveThemeColors } from '../../tokens'
 *
 * const colors = resolveThemeColors(context.theme, context.isAsiaMarket)
 * ```
 */

import type { ColorTokens, Theme } from './types'
import { lightTheme } from './theme-light'
import { darkTheme } from './theme-dark'
import { applyColorPresetOverrides, type ColorPresetSettings } from './colorPresetSettings'

/**
 * Swap all bull/bear colour pairs in a Theme so that "up" (bull) uses
 * the formerly "down" (bear) colour and vice versa.
 *
 * @param theme — the base Theme (Western convention)
 * @returns a **new** Theme object; the original is not mutated.
 */
export function withAsiaMarketColors(theme: Theme): Theme {
    return {
        ...theme,
        colors: {
            ...theme.colors,

            // ── Candle / OHLC ──
            candleUpBody: theme.colors.candleDownBody,
            candleDownBody: theme.colors.candleUpBody,
            candleUpBorder: theme.colors.candleDownBorder,
            candleDownBorder: theme.colors.candleUpBorder,
            candleUpWick: theme.colors.candleDownWick,
            candleDownWick: theme.colors.candleUpWick,

            // ── Volume bars ──
            volumeUp: theme.colors.volumeDown,
            volumeDown: theme.colors.volumeUp,

            // ── Footprint (ask = buy = bull, bid = sell = bear) ──
            footprintAsk: theme.colors.footprintBid,
            footprintBid: theme.colors.footprintAsk,

            // ── Nested: price accents ──
            price: {
                ...theme.colors.price,
            },

            // ── Nested: MACD histogram bars ──
            macd: {
                ...theme.colors.macd,
                barUp: theme.colors.macd.barDown,
                barDown: theme.colors.macd.barUp,
                barUpLight: theme.colors.macd.barDownLight,
                barDownLight: theme.colors.macd.barUpLight,
            },

            // ── Nested: SMC structure (HH/HL = bull, LH/LL = bear) ──
            structure: {
                ...theme.colors.structure,
                hh: theme.colors.structure.ll,
                ll: theme.colors.structure.hh,
                hl: theme.colors.structure.lh,
                lh: theme.colors.structure.hl,
            },

            // ── Nested: Zones / FVG / Order Block ──
            zones: {
                ...theme.colors.zones,
                fvgBullFill: theme.colors.zones.fvgBearFill,
                fvgBearFill: theme.colors.zones.fvgBullFill,
                fvgBullBorder: theme.colors.zones.fvgBearBorder,
                fvgBearBorder: theme.colors.zones.fvgBullBorder,
                obBullFill: theme.colors.zones.obBearFill,
                obBearFill: theme.colors.zones.obBullFill,
            },

            // ── Nested: CCI overbought (bull) / oversold (bear) ──
            cci: {
                ...theme.colors.cci,
                overbought: theme.colors.cci.oversold,
                oversold: theme.colors.cci.overbought,
            },

            // ── Nested: WMSR overbought / oversold ──
            wmsr: {
                ...theme.colors.wmsr,
                overbought: theme.colors.wmsr.oversold,
                oversold: theme.colors.wmsr.overbought,
            },
        },
    }
}

/**
 * Resolve a theme name + optional Asia-market flag into concrete
 * {@link ColorTokens}.
 *
 * Renderers replace this pattern:
 * ```ts
 * const colors = theme === 'dark' ? darkTheme.colors : lightTheme.colors
 * ```
 * with:
 * ```ts
 * const colors = resolveThemeColors(theme, isAsiaMarket)
 * ```
 */
export function resolveThemeColors(
    themeName: 'light' | 'dark',
    isAsiaMarket?: boolean,
    colorPresetSettings?: ColorPresetSettings,
): ColorTokens {
    const base = themeName === 'dark' ? darkTheme : lightTheme
    const active = isAsiaMarket ? withAsiaMarketColors(base) : base
    return applyColorPresetOverrides(active.colors, themeName, colorPresetSettings)
}
