/**
 * @klinechart-quant/core/tokens — semantic design tokens + presets.
 *
 * See `./types.ts` for the contract; `./theme-light.ts` and
 * `./theme-dark.ts` for shipping presets; `./mergeTheme.ts` for the
 * override helper.
 *
 * Public surface from the root `@klinechart-quant/core` barrel.
 */

export { COLOR_PICKER_CSS_VARS } from './colorPicker.js'
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
  UI_COLOR_PRESET_ITEMS,
  type UiColorPresetKey,
} from './colorPresetSettings.js'
export { DEFAULT_DRAWING_STROKE, DRAWING_ANCHOR_FILL } from './drawingColors.js'
export { darkFoundation, foundationTokens, lightFoundation } from './foundation.js'
export { mergeTheme } from './mergeTheme.js'
export { findThemePreset, THEME_PRESETS } from './presets/impl/themePresets.js'
export { DEFAULT_THEME_PRESET, type ThemePreset, type ThemePresetId } from './presets/types.js'
export { resolveTheme, resolveThemeColors, withAsiaMarketColors } from './theme-china.js'
export { darkTheme } from './theme-dark.js'
export { lightTheme } from './theme-light.js'
export {
  camelToKebab,
  FOUNDATION_GROUPS,
  type ThemeToCssVarsOptions,
  themeToCssVars,
  toCssDeclarationBlock,
} from './themeToCssVars.js'
export type {
  AgentColors,
  BOLLColors,
  BorderColors,
  BrandTokens,
  BreakpointTokens,
  CCIColors,
  ColorTokens,
  ColorValue,
  CssDuration,
  CssEasing,
  CssLength,
  DensityTokens,
  ElevationTokens,
  ENEColors,
  EXPMAColors,
  FoundationMotionTokens,
  FoundationTokens,
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
  RadiusTokens,
  RSIColors,
  SpaceStep,
  SpaceTokens,
  SpacingTokens,
  StructureColors,
  TagBgColors,
  TextColors,
  TextCopyStep,
  TextLabelStep,
  TextScaleStep,
  TextStyleTokens,
  TextTokens,
  Theme,
  ThemeOverride,
  TypographyTokens,
  UiColors,
  VolumePriceColors,
  WMSRColors,
  ZIndexTokens,
  ZonesColors,
} from './types.js'
