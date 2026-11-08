/**
 * 颜色透明度缩放。
 *
 * 主题里的颜色自带 alpha（例如成交量分布的价值区横条是 70% 不透明），
 * 指标允许用户单独调整某个部位的不透明度时，需要「在主题透明度基础上再缩放」，
 * 而不是整体替换 alpha，否则默认值也要写成具体数字、与主题脱钩。
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import type { ColorValue } from './types.js'

/** 解析后的颜色分量；分量取 0-255，alpha 取 0-1。 */
interface ParsedColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

/** `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`。 */
const HEX_COLOR_PATTERN = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i

/** `rgb(r, g, b)` 与 `rgba(r, g, b, a)`；分量限定十进制或百分比之外的常用写法。 */
const RGB_COLOR_PATTERN =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i

/** 把十六进制颜色拆成分量；三/四位的短写先展开成六/八位。 */
function parseHexColor(value: string): ParsedColor {
  const raw = value.slice(1)
  const hex = raw.length < 5 ? [...raw].map((char) => char + char).join('') : raw
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  }
}

/** 把 rgb()/rgba() 文本拆成分量；alpha 缺省为 1。 */
function parseRgbColor(value: string): ParsedColor {
  const matched = RGB_COLOR_PATTERN.exec(value)
  if (!matched) throw unsupportedColor(value)
  const alphaText = matched[4]
  return {
    red: Number(matched[1]),
    green: Number(matched[2]),
    blue: Number(matched[3]),
    alpha: alphaText === undefined ? 1 : Number(alphaText),
  }
}

/** 不支持的写法抛出错误：静默回退会让配色错误难以发现。 */
function unsupportedColor(value: string): KLineChartError {
  return new KLineChartError(
    GENERIC_ERROR_CODES.INVALID_PARAM,
    `[tokens] unsupported color for alpha scaling: ${value}`,
  )
}

/**
 * 解析受支持的 CSS 颜色。
 * @param value 十六进制或 rgb()/rgba() 颜色
 * @returns 颜色分量与原有 alpha
 */
function parseColor(value: ColorValue): ParsedColor {
  const text = value.trim()
  if (HEX_COLOR_PATTERN.test(text)) return parseHexColor(text)
  return parseRgbColor(text)
}

/**
 * 按系数缩放颜色的 alpha 通道。
 *
 * 系数为 1 时原样返回，避免把 `#RRGGBBAA` 改写成 `rgba()` 文本。
 * @param color CSS 颜色
 * @param factor 缩放系数；超出 0-1 时先夹紧
 * @returns 缩放后的 CSS 颜色
 */
export function scaleColorAlpha(color: ColorValue, factor: number): ColorValue {
  if (factor === 1) return color
  const clamped = Math.min(1, Math.max(0, factor))
  const parsed = parseColor(color)
  const alpha = Math.min(1, Math.max(0, parsed.alpha * clamped))
  return `rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${Number(alpha.toFixed(4))})`
}
