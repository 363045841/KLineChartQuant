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
    readonly indicatorAtr: ColorValue
}

/**
 * Semantic color roles every renderable surface element claims.
 *
 * "Up" / "Down" is the bull / bear axis. We deliberately do **not**
 * call them green / red — Asian markets use the opposite convention
 * and the token must let that flip with a single override.
 */
/**
 * Text colors — importance levels for UI labels & annotations.
 */
export interface TextColors {
    readonly primary: ColorValue
    readonly secondary: ColorValue
    readonly tertiary: ColorValue
    readonly weak: ColorValue
    readonly white: ColorValue
}

/**
 * Price accent colors — tick highlights, last-price marker, etc.
 * The main up/down body colors live on the top-level ColorTokens
 * (candleUpBody / candleDownBody); this group covers extras.
 */
export interface PriceColors {
    readonly upLight: ColorValue
    readonly upTick: ColorValue
    readonly downLight: ColorValue
    readonly downTick: ColorValue
    readonly lastPrice: ColorValue
}

/**
 * Tag / label background colours — toolbar buttons, active states.
 */
export interface TagBgColors {
    readonly white: ColorValue
    readonly lightGray: ColorValue
    readonly pureWhite: ColorValue
    readonly transparent: ColorValue
    readonly active: ColorValue
    readonly activeHover: ColorValue
    readonly hover: ColorValue
}

/**
 * Border / stroke colours for UI chrome.
 */
export interface BorderColors {
    readonly dark: ColorValue
    readonly medium: ColorValue
    readonly light: ColorValue
    readonly separator: ColorValue
    readonly button: ColorValue
    readonly chart: ColorValue
}

/** Moving-average line colours (MA5 / MA10 / MA20 / MA30 / MA60). */
export interface MAColors {
    readonly ma5: ColorValue
    readonly ma10: ColorValue
    readonly ma20: ColorValue
    readonly ma30: ColorValue
    readonly ma60: ColorValue
}

/** Bollinger Bands stroke & fill colours. */
export interface BOLLColors {
    readonly upper: ColorValue
    readonly middle: ColorValue
    readonly lower: ColorValue
    readonly bandFill: ColorValue
}

/** MACD indicator colours. */
export interface MACDColors {
    readonly dif: ColorValue
    readonly dea: ColorValue
    readonly barUp: ColorValue
    readonly barUpLight: ColorValue
    readonly barDown: ColorValue
    readonly barDownLight: ColorValue
}

/** RSI indicator colours. */
export interface RSIColors {
    readonly rsi1: ColorValue
    readonly rsi2: ColorValue
    readonly rsi3: ColorValue
}

/** CCI indicator colours. */
export interface CCIColors {
    readonly cci: ColorValue
    readonly overbought: ColorValue
    readonly oversold: ColorValue
}

/** KDJ / Stochastic indicator colours. */
export interface KDJColors {
    readonly k: ColorValue
    readonly d: ColorValue
    readonly j: ColorValue
}

/** MOM (Momentum) indicator colours. */
export interface MOMColors {
    readonly mom: ColorValue
    readonly zero: ColorValue
}

/** WMSR (Williams %R) indicator colours. */
export interface WMSRColors {
    readonly wmsr: ColorValue
    readonly overbought: ColorValue
    readonly oversold: ColorValue
}

/** KST (Know Sure Thing) indicator colours. */
export interface KSTColors {
    readonly kst: ColorValue
    readonly signal: ColorValue
}

/** EXPMA (Exponential MA) indicator colours. */
export interface EXPMAColors {
    readonly fast: ColorValue
    readonly slow: ColorValue
}

/** ENE (Envelope) indicator colours. */
export interface ENEColors {
    readonly upper: ColorValue
    readonly middle: ColorValue
    readonly lower: ColorValue
    readonly bandFill: ColorValue
}

/** Generic label colours (tooltip-like overlays). */
export interface LabelColors {
    readonly bg: ColorValue
    readonly text: ColorValue
}

/** Last-price marker label colours. */
export interface LastPriceLabelColors {
    readonly bg: ColorValue
}

/** Volume-price relationship markers. */
export interface VolumePriceColors {
    readonly riseWith: ColorValue
    readonly riseWithout: ColorValue
    readonly fallWith: ColorValue
    readonly fallWithout: ColorValue
}

/** Structure (SMC) indicator — HH/HL/LH/LL/CHoCH/BOS. */
export interface StructureColors {
    readonly hh: ColorValue
    readonly hl: ColorValue
    readonly lh: ColorValue
    readonly ll: ColorValue
    readonly choch: ColorValue
    readonly bos: ColorValue
}

/** Zones / FVG / Order-Block indicator colours. */
export interface ZonesColors {
    readonly fvgBullFill: ColorValue
    readonly fvgBearFill: ColorValue
    readonly fvgBullBorder: ColorValue
    readonly fvgBearBorder: ColorValue
    readonly obBullFill: ColorValue
    readonly obBearFill: ColorValue
}

export interface ColorTokens {
    // Chart-wide background + foreground
    readonly background: ColorValue
    readonly foreground: ColorValue
    readonly chartBackground: ColorValue

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

    // ── Legacy indicator colours (from engine/theme/colors) ──
    readonly text: TextColors
    readonly price: PriceColors
    readonly tagBg: TagBgColors
    readonly border: BorderColors
    readonly ma: MAColors
    readonly boll: BOLLColors
    readonly macd: MACDColors
    readonly rsi: RSIColors
    readonly cci: CCIColors
    readonly kdj: KDJColors
    readonly mom: MOMColors
    readonly wmsr: WMSRColors
    readonly kst: KSTColors
    readonly expma: EXPMAColors
    readonly ene: ENEColors
    readonly label: LabelColors
    readonly lastPriceLabel: LastPriceLabelColors
    readonly volumePrice: VolumePriceColors
    readonly structure: StructureColors
    readonly zones: ZonesColors
    readonly wmsrGrid: ColorValue
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
