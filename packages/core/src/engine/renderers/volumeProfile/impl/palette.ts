/**
 * 成交量分布的配色解析：把参数里的颜色覆盖与不透明度叠加到主题配色上。
 *
 * 颜色默认空串表示跟随主题；不透明度是相对主题原有 alpha 的缩放百分比，
 * 所以 100 时画出来的颜色与纯主题配色逐字节相同。
 */
import type { ColorTokens } from '../../../../foundation/tokens/index.js'
import { scaleColorAlpha } from '../../../../foundation/tokens/index.js'
import type { VolumeProfileColorParams, VolumeProfileOpacityParams } from '../types.js'
import { DEFAULT_VOLUME_PROFILE_PARAMS } from '../types.js'

/** 允许写在参数里的颜色写法：空串（跟随主题）或六位十六进制。 */
const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i

/**
 * 读取颜色覆盖参数。
 * @param value 参数原值
 * @param fallback 参数无效时的取值
 * @returns `''`（跟随主题）或 `#rrggbb`
 */
export function readVolumeProfileColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (value === '' || HEX_COLOR_PATTERN.test(value)) return value
  return fallback
}

/** 读取不透明度百分比；非有限值回落到默认值并夹在 0-100。 */
function readOpacity(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, parsed))
}

/**
 * 归一化颜色与不透明度参数。
 *
 * 指标实例首帧拿到的是 `undefined`，用户改参后记录里也可能只含被改动的字段，
 * 因此必须逐项校验并用默认值补齐。
 * @param params 原始参数表
 * @returns 完整的颜色与不透明度参数
 */
export function readVolumeProfilePaletteParams(
  params: Record<string, unknown> | undefined,
): VolumeProfileColorParams & VolumeProfileOpacityParams {
  const defaults = DEFAULT_VOLUME_PROFILE_PARAMS
  return {
    upColor: readVolumeProfileColor(params?.upColor, defaults.upColor),
    upOpacity: readOpacity(params?.upOpacity, defaults.upOpacity),
    downColor: readVolumeProfileColor(params?.downColor, defaults.downColor),
    downOpacity: readOpacity(params?.downOpacity, defaults.downOpacity),
    valueAreaUpColor: readVolumeProfileColor(params?.valueAreaUpColor, defaults.valueAreaUpColor),
    valueAreaUpOpacity: readOpacity(params?.valueAreaUpOpacity, defaults.valueAreaUpOpacity),
    valueAreaDownColor: readVolumeProfileColor(
      params?.valueAreaDownColor,
      defaults.valueAreaDownColor,
    ),
    valueAreaDownOpacity: readOpacity(params?.valueAreaDownOpacity, defaults.valueAreaDownOpacity),
    pointOfControlColor: readVolumeProfileColor(
      params?.pointOfControlColor,
      defaults.pointOfControlColor,
    ),
    pointOfControlOpacity: readOpacity(
      params?.pointOfControlOpacity,
      defaults.pointOfControlOpacity,
    ),
    valueAreaHighColor: readVolumeProfileColor(
      params?.valueAreaHighColor,
      defaults.valueAreaHighColor,
    ),
    valueAreaHighOpacity: readOpacity(params?.valueAreaHighOpacity, defaults.valueAreaHighOpacity),
    valueAreaLowColor: readVolumeProfileColor(
      params?.valueAreaLowColor,
      defaults.valueAreaLowColor,
    ),
    valueAreaLowOpacity: readOpacity(params?.valueAreaLowOpacity, defaults.valueAreaLowOpacity),
    boxBackgroundColor: readVolumeProfileColor(
      params?.boxBackgroundColor,
      defaults.boxBackgroundColor,
    ),
    boxBackgroundOpacity: readOpacity(params?.boxBackgroundOpacity, defaults.boxBackgroundOpacity),
  }
}

/** 单个部位：覆盖色优先，空串跟随主题，再按不透明度缩放 alpha。 */
function resolvePartColor(base: string, override: string, opacity: number): string {
  const color = override === '' ? base : override
  return scaleColorAlpha(color, opacity / 100)
}

/**
 * 把参数应用到主题配色上，得到本帧实际使用的颜色。
 * @param base 主题提供的成交量分布配色
 * @param params 归一化后的颜色与不透明度参数
 * @returns 逐部位解析后的配色
 */
export function resolveVolumeProfilePalette(
  base: ColorTokens['volumeProfile'],
  params: VolumeProfileColorParams & VolumeProfileOpacityParams,
): ColorTokens['volumeProfile'] {
  return {
    up: resolvePartColor(base.up, params.upColor, params.upOpacity),
    down: resolvePartColor(base.down, params.downColor, params.downOpacity),
    valueAreaUp: resolvePartColor(
      base.valueAreaUp,
      params.valueAreaUpColor,
      params.valueAreaUpOpacity,
    ),
    valueAreaDown: resolvePartColor(
      base.valueAreaDown,
      params.valueAreaDownColor,
      params.valueAreaDownOpacity,
    ),
    pointOfControl: resolvePartColor(
      base.pointOfControl,
      params.pointOfControlColor,
      params.pointOfControlOpacity,
    ),
    valueAreaHigh: resolvePartColor(
      base.valueAreaHigh,
      params.valueAreaHighColor,
      params.valueAreaHighOpacity,
    ),
    valueAreaLow: resolvePartColor(
      base.valueAreaLow,
      params.valueAreaLowColor,
      params.valueAreaLowOpacity,
    ),
    boxBackground: resolvePartColor(
      base.boxBackground,
      params.boxBackgroundColor,
      params.boxBackgroundOpacity,
    ),
  }
}
