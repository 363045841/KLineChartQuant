import type { ColorTokens, ColorValue } from './types'

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

export type ColorPresetOverrides = Partial<Record<ColorPresetKey, ColorValue>>

export type ColorPresetSettings = Partial<Record<ColorPresetThemeName, ColorPresetOverrides>>

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

const COLOR_PRESET_KEYS = new Set<ColorPresetKey>(COLOR_PRESET_ITEMS.map((item) => item.key))

export function normalizeColorPresetSettings(value: unknown): ColorPresetSettings {
    if (!value || typeof value !== 'object') return {}

    const source = value as Record<string, unknown>
    const result: ColorPresetSettings = {}

    for (const themeName of ['light', 'dark'] as const) {
        const themeOverrides = source[themeName]
        if (!themeOverrides || typeof themeOverrides !== 'object') continue

        const clean: ColorPresetOverrides = {}
        for (const [key, color] of Object.entries(themeOverrides as Record<string, unknown>)) {
            if (COLOR_PRESET_KEYS.has(key as ColorPresetKey) && typeof color === 'string' && color.trim()) {
                clean[key as ColorPresetKey] = color
            }
        }
        if (Object.keys(clean).length > 0) result[themeName] = clean
    }

    return result
}

export function applyColorPresetOverrides(
    colors: ColorTokens,
    themeName: ColorPresetThemeName,
    settings?: ColorPresetSettings,
): ColorTokens {
    const overrides = settings?.[themeName]
    if (!overrides || Object.keys(overrides).length === 0) return colors
    return { ...colors, ...overrides }
}
