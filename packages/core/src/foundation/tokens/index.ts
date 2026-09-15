/**
 * @klinechart-quant/core/tokens — semantic design tokens + presets.
 *
 * See `./types.ts` for the contract; `./theme-light.ts` and
 * `./theme-dark.ts` for shipping presets; `./mergeTheme.ts` for the
 * override helper.
 *
 * Public surface from the root `@klinechart-quant/core` barrel.
 */

export {
  applyColorPresetOverrides,
  COLOR_PRESET_ITEMS,
  COLOR_PRESET_STORAGE_KEY,
  type ColorPresetItem,
  type ColorPresetKey,
  type ColorPresetOverrides,
  type ColorPresetSettings,
  type ColorPresetThemeName,
  normalizeColorPresetSettings,
} from './colorPresetSettings'
export { DEFAULT_DRAWING_STROKE } from './drawingColors'
export { mergeTheme } from './mergeTheme'
export { resolveThemeColors, withAsiaMarketColors } from './theme-china'
export { darkTheme } from './theme-dark'
export { lightTheme } from './theme-light'
export {
  camelToKebab,
  type ThemeToCssVarsOptions,
  themeToCssVars,
  toCssDeclarationBlock,
} from './themeToCssVars'
export type {
  AgentColors,
  BOLLColors,
  BorderColors,
  CCIColors,
  ColorTokens,
  ColorValue,
  CssDuration,
  CssEasing,
  CssLength,
  ENEColors,
  EXPMAColors,
  IndicatorPalette,
  KDJColors,
  KSTColors,
  LabelColors,
  LastPriceLabelColors,
  MACDColors,
  MAColors,
  MOMColors,
  MotionTokens,
  PriceColors,
  RSIColors,
  SpacingTokens,
  StructureColors,
  TagBgColors,
  TextColors,
  Theme,
  ThemeOverride,
  TypographyTokens,
  UiColors,
  VolumePriceColors,
  WMSRColors,
  ZonesColors,
} from './types'
