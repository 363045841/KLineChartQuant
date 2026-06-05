/**
 * @klinechart-quant/core/tokens — semantic design tokens + presets.
 *
 * See `./types.ts` for the contract; `./theme-light.ts` and
 * `./theme-dark.ts` for shipping presets; `./mergeTheme.ts` for the
 * override helper.
 *
 * Public surface from the root `@klinechart-quant/core` barrel.
 */

export type {
    Theme,
    ThemeOverride,
    ColorTokens,
    SpacingTokens,
    TypographyTokens,
    MotionTokens,
    IndicatorPalette,
    ColorValue,
    CssLength,
    CssDuration,
    CssEasing,
    TextColors,
    PriceColors,
    TagBgColors,
    BorderColors,
    MAColors,
    BOLLColors,
    MACDColors,
    RSIColors,
    CCIColors,
    KDJColors,
    MOMColors,
    WMSRColors,
    KSTColors,
    EXPMAColors,
    ENEColors,
    LabelColors,
    LastPriceLabelColors,
    VolumePriceColors,
    StructureColors,
    ZonesColors,
} from './types'

export { lightTheme } from './theme-light'
export { darkTheme } from './theme-dark'
export { withAsiaMarketColors, resolveThemeColors } from './theme-china'
export { mergeTheme } from './mergeTheme'
export {
    themeToCssVars,
    toCssDeclarationBlock,
    camelToKebab,
    type ThemeToCssVarsOptions,
} from './themeToCssVars'
