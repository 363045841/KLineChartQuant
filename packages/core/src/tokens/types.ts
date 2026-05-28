/**
 * Design token contract — the typed surface every theme must satisfy.
 *
 * Tokens are **semantic** (named by role: `candleUpBody`, not by value:
 * `green500`). Themes are concrete `Record<TokenKey, string>` objects
 * conforming to {@link Theme}. Two presets ship: {@link lightTheme}
 * and {@link darkTheme}. Consumers compose their own theme by spreading
 * a preset and overriding the keys they care about.
 *
 * Rationale: TradingView's customisation surface is ad-hoc settings
 * sprawl. A token contract is the foundation for (1) a coherent default
 * look, (2) a no-code theme editor, (3) visual regression baselines,
 * and (4) WCAG audits that run in CI.
 *
 * Scope of v1: chart-visible roles only. We do **not** ship UI-chrome
 * tokens (button colors, modal background, etc.) — those live with the
 * host app. The contract is the chart canvas surface.
 */

/**
 * Concrete color value. Always a CSS color string — `#rrggbb`, `#rrggbbaa`,
 * `rgb(...)`, `rgba(...)`, or named CSS color. Themes typically use 6- or
 * 8-digit hex for renderer-friendly parsing.
 */
export type ColorValue = string

/**
 * CSS length. Always a string with a unit (`'8px'`, `'0.5rem'`, `'1.25em'`).
 * Renderers parse with the host CSSOM; bench-time renderers may use a
 * px-only fast path.
 */
export type CssLength = string

/**
 * CSS duration string (`'120ms'`, `'0.2s'`). For motion tokens.
 */
export type CssDuration = string

/**
 * CSS easing function (`'ease-out'`, `'cubic-bezier(0.4, 0, 0.2, 1)'`).
 */
export type CssEasing = string

/**
 * Indicator palette. Ten distinguishable colors for overlay/separate-pane
 * indicators (MA1, MA2, ..., MA10). The palette is *qualitative* — perceptual
 * distance optimised for category distinction, not for ordinal scale. WCAG
 * AA contrast against both light- and dark-pane backgrounds.
 */
export interface IndicatorPalette {
    readonly i1: ColorValue
    readonly i2: ColorValue
    readonly i3: ColorValue
    readonly i4: ColorValue
    readonly i5: ColorValue
    readonly i6: ColorValue
    readonly i7: ColorValue
    readonly i8: ColorValue
    readonly i9: ColorValue
    readonly i10: ColorValue
}

/**
 * Semantic color roles every renderable surface element claims.
 *
 * "Up" / "Down" is the bull / bear axis. We deliberately do **not**
 * call them green / red — Asian markets use the opposite convention
 * and the token must let that flip with a single override.
 */
export interface ColorTokens {
    // Chart-wide background + foreground
    readonly background: ColorValue
    readonly foreground: ColorValue

    // Candle / OHLC bar
    readonly candleUpBody: ColorValue
    readonly candleUpBorder: ColorValue
    readonly candleUpWick: ColorValue
    readonly candleDownBody: ColorValue
    readonly candleDownBorder: ColorValue
    readonly candleDownWick: ColorValue
    readonly candleDojiBorder: ColorValue

    // Volume bars (paired with candle bull/bear)
    readonly volumeUp: ColorValue
    readonly volumeDown: ColorValue

    // Price + time axes
    readonly axisText: ColorValue
    readonly axisLine: ColorValue
    readonly axisTick: ColorValue

    // Grid
    readonly gridMajor: ColorValue
    readonly gridMinor: ColorValue

    // Crosshair
    readonly crosshairLine: ColorValue
    readonly crosshairLabelBg: ColorValue
    readonly crosshairLabelText: ColorValue

    // Selection / hover
    readonly selectionFill: ColorValue
    readonly selectionStroke: ColorValue

    // Tooltip / legend
    readonly tooltipBg: ColorValue
    readonly tooltipText: ColorValue
    readonly tooltipBorder: ColorValue

    // Footprint / heatmap / volume profile (specialised components)
    readonly heatmapColdest: ColorValue
    readonly heatmapHottest: ColorValue
    readonly volumeProfileFill: ColorValue
    readonly volumeProfilePoc: ColorValue
    readonly volumeProfileValueArea: ColorValue
    readonly footprintAsk: ColorValue
    readonly footprintBid: ColorValue
    readonly footprintImbalance: ColorValue

    // Alerts
    readonly alertActive: ColorValue
    readonly alertTriggered: ColorValue
    readonly alertMuted: ColorValue

    // Anchored VWAP / MTF overlay accents
    readonly avwapLine: ColorValue
    readonly avwapBand: ColorValue
    readonly mtfOverlay: ColorValue

    // Indicator palette (composes ColorTokens)
    readonly palette: IndicatorPalette
}

/**
 * Spatial rhythm. All tokens are CSS length strings with units; renderers
 * parse to px at apply time. The progression is a 4-px base scale that
 * scales linearly up to 32px, then doubles.
 */
export interface SpacingTokens {
    readonly none: CssLength    // '0'
    readonly xxs: CssLength     // '2px'
    readonly xs: CssLength      // '4px'
    readonly sm: CssLength      // '8px'
    readonly md: CssLength      // '12px'
    readonly lg: CssLength      // '16px'
    readonly xl: CssLength      // '24px'
    readonly xxl: CssLength     // '32px'
    readonly xxxl: CssLength    // '64px'
}

/**
 * Typography stack. Renderers compose a font shorthand from these.
 */
export interface TypographyTokens {
    readonly fontFamily: string             // Includes fallbacks
    readonly fontFamilyMono: string         // For numeric tick labels
    readonly fontSizeSm: CssLength          // '10px' (axis ticks)
    readonly fontSizeMd: CssLength          // '12px' (default body)
    readonly fontSizeLg: CssLength          // '14px' (legends)
    readonly fontWeightRegular: number      // 400
    readonly fontWeightMedium: number       // 500
    readonly fontWeightBold: number         // 700
    readonly lineHeightTight: number        // 1.2
    readonly lineHeightStandard: number     // 1.4
}

/**
 * Animation. We use them sparingly (zoom inertia, crosshair fade)
 * but the tokens exist so the same easing is reused everywhere.
 */
export interface MotionTokens {
    readonly durationInstant: CssDuration   // '0ms' (default for finance — no jitter)
    readonly durationFast: CssDuration      // '120ms'
    readonly durationModerate: CssDuration  // '200ms'
    readonly easingStandard: CssEasing      // 'cubic-bezier(0.4, 0, 0.2, 1)'
    readonly easingDecelerate: CssEasing    // 'cubic-bezier(0, 0, 0.2, 1)'
}

/**
 * Complete theme — all four token families.
 */
export interface Theme {
    readonly name: string
    readonly colors: ColorTokens
    readonly spacing: SpacingTokens
    readonly typography: TypographyTokens
    readonly motion: MotionTokens
}

/**
 * Convenience: deep-Partial used for `mergeTheme(base, override)`.
 */
export type ThemeOverride = {
    readonly [K in keyof Theme]?: K extends 'name'
        ? string
        : Theme[K] extends object
            ? Partial<Theme[K]>
            : Theme[K]
}
