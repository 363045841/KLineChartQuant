// 深浅主题的颜色覆盖契约；图表与 UI 共用归一化和解析入口。
import { findThemePreset } from './presets/impl/themePresets.js'
import type { ThemePresetId } from './presets/types.js'
import type { ColorTokens, ColorValue, UiColors } from './types.js'

export type ColorPresetThemeName = 'light' | 'dark'

export type ColorPresetKey = keyof Pick<
  ColorTokens,
  | 'background'
  | 'foreground'
  | 'chartBackground'
  | 'candleUpBody'
  | 'candleUpBorder'
  | 'candleUpWick'
  | 'candleDownBody'
  | 'candleDownBorder'
  | 'candleDownWick'
  | 'performancePositive'
  | 'performanceNegative'
  | 'performanceNeutral'
  | 'volumeUp'
  | 'volumeDown'
  | 'axisText'
  | 'axisLine'
  | 'axisTick'
  | 'gridMajor'
  | 'gridMinor'
  | 'crosshairLine'
  | 'crosshairLabelBg'
  | 'crosshairLabelText'
  | 'selectionFill'
  | 'selectionStroke'
  | 'tooltipBg'
  | 'tooltipText'
  | 'tooltipBorder'
  | 'volumeProfilePoc'
  | 'footprintAsk'
  | 'footprintBid'
  | 'footprintImbalance'
  | 'alertActive'
  | 'alertTriggered'
  | 'alertMuted'
  | 'avwapLine'
  | 'avwapBand'
  | 'mtfOverlay'
>

export interface ColorPresetItem {
  readonly key: ColorPresetKey
  readonly label: string
  readonly group: 'canvas' | 'candle' | 'axis' | 'interaction'
}

export type ColorPresetOverrides = Partial<Record<ColorPresetKey, ColorValue>> & {
  ui?: Partial<Record<UiColorPresetKey, ColorValue>>
}

/** 主题编辑器的基础界面颜色，key 直接对应现有 UI Token。 */
export const UI_COLOR_PRESET_ITEMS = [
  { key: 'background', label: '页面背景', group: 'interface' },
  { key: 'surface', label: '面板背景', group: 'interface' },
  { key: 'card', label: '卡片背景', group: 'interface' },
  { key: 'border', label: '界面边框', group: 'interface' },
  { key: 'accent', label: '按钮与强调色', group: 'interface' },
  { key: 'controlBackground', label: '控件背景', group: 'interface' },
  { key: 'input', label: '输入框背景', group: 'interface' },
  { key: 'hover', label: '悬停背景', group: 'interface' },
  { key: 'focus', label: '焦点描边', group: 'interface' },
  { key: 'text', label: '主要文字', group: 'text' },
  { key: 'muted', label: '辅助文字', group: 'text' },
  { key: 'onAccent', label: '按钮文字', group: 'text' },
] as const satisfies ReadonlyArray<{
  key: keyof UiColors
  label: string
  group: 'interface' | 'text'
}>
export type UiColorPresetKey = (typeof UI_COLOR_PRESET_ITEMS)[number]['key']

export interface ColorPresetSettings {
  preset?: ThemePresetId
  light?: ColorPresetOverrides
  dark?: ColorPresetOverrides
}

export const COLOR_PRESET_STORAGE_KEY = 'kline-chart-color-presets'

export const COLOR_PRESET_ITEMS: readonly ColorPresetItem[] = [
  { key: 'background', label: '背景', group: 'canvas' },
  { key: 'chartBackground', label: '图表背景', group: 'canvas' },
  { key: 'foreground', label: '前景', group: 'canvas' },
  { key: 'gridMajor', label: '主网格线', group: 'canvas' },
  { key: 'gridMinor', label: '次网格线', group: 'canvas' },

  { key: 'candleUpBody', label: '上涨实体', group: 'candle' },
  { key: 'candleUpBorder', label: '上涨边框', group: 'candle' },
  { key: 'candleUpWick', label: '上涨影线', group: 'candle' },
  { key: 'candleDownBody', label: '下跌实体', group: 'candle' },
  { key: 'candleDownBorder', label: '下跌边框', group: 'candle' },
  { key: 'candleDownWick', label: '下跌影线', group: 'candle' },
  { key: 'volumeUp', label: '上涨成交量', group: 'candle' },
  { key: 'volumeDown', label: '下跌成交量', group: 'candle' },
  { key: 'performancePositive', label: '正收益', group: 'candle' },
  { key: 'performanceNegative', label: '负收益', group: 'candle' },
  { key: 'performanceNeutral', label: '持平收益', group: 'candle' },

  { key: 'axisText', label: '坐标文字', group: 'axis' },
  { key: 'axisLine', label: '坐标轴线', group: 'axis' },
  { key: 'axisTick', label: '坐标刻度', group: 'axis' },

  { key: 'crosshairLine', label: '十字光标', group: 'interaction' },
  { key: 'crosshairLabelBg', label: '光标标签背景', group: 'interaction' },
  { key: 'crosshairLabelText', label: '光标标签文字', group: 'interaction' },
  { key: 'selectionFill', label: '选区填充', group: 'interaction' },
  { key: 'selectionStroke', label: '选区边框', group: 'interaction' },
  { key: 'tooltipBg', label: '提示背景', group: 'interaction' },
  { key: 'tooltipText', label: '提示文字', group: 'interaction' },
  { key: 'tooltipBorder', label: '提示边框', group: 'interaction' },

  { key: 'volumeProfilePoc', label: '成交量 POC', group: 'interaction' },
  { key: 'footprintAsk', label: '主动买盘', group: 'interaction' },
  { key: 'footprintBid', label: '主动卖盘', group: 'interaction' },
  { key: 'footprintImbalance', label: '订单失衡', group: 'interaction' },
  { key: 'alertActive', label: '活动警报', group: 'interaction' },
  { key: 'alertTriggered', label: '触发警报', group: 'interaction' },
  { key: 'alertMuted', label: '静音警报', group: 'interaction' },
  { key: 'avwapLine', label: 'AVWAP 线', group: 'interaction' },
  { key: 'avwapBand', label: 'AVWAP 区域', group: 'interaction' },
  { key: 'mtfOverlay', label: '多周期叠加', group: 'interaction' },
]

/** 判断外部配置是否为普通键值集合。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 过滤未知字段与空值，保持旧的平铺图表覆盖格式，并接纳嵌套 UI Token。 */
export function normalizeColorPresetSettings(value?: unknown): ColorPresetSettings {
  if (!isRecord(value)) return {}
  const result: ColorPresetSettings = {}
  const preset = findThemePreset(value.preset)
  if (preset) result.preset = preset.id
  for (const themeName of ['light', 'dark'] as const) {
    const source = value[themeName]
    if (!isRecord(source)) continue
    const clean: ColorPresetOverrides = {}
    for (const { key } of COLOR_PRESET_ITEMS) {
      const color = source[key]
      if (typeof color === 'string' && color.trim()) clean[key] = color
    }
    if (isRecord(source.ui)) {
      const ui: NonNullable<ColorPresetOverrides['ui']> = {}
      for (const { key } of UI_COLOR_PRESET_ITEMS) {
        const color = source.ui[key]
        if (typeof color === 'string' && color.trim()) ui[key] = color
      }
      if (Object.keys(ui).length) clean.ui = ui
    }
    if (Object.keys(clean).length) result[themeName] = clean
  }
  return result
}

/** 生成新的颜色快照，嵌套 UI 按字段合并，不污染默认主题或其他实例。 */
export function applyColorPresetOverrides(
  colors: ColorTokens,
  themeName: ColorPresetThemeName,
  settings?: ColorPresetSettings,
): ColorTokens {
  const overrides = settings?.[themeName]
  if (!overrides || Object.keys(overrides).length === 0) return colors
  const { ui, ...flatColors } = overrides
  return { ...colors, ...flatColors, ui: { ...colors.ui, ...ui } }
}
