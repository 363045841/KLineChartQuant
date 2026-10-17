// 色板坐标与 CSS 颜色之间的转换，保持透明度。
import type { PickerColor } from '../types.js'

/** 将浏览器支持的 CSS 颜色解析为 HSV 与透明度。 */
export function parsePickerColor(value: string): PickerColor | null {
  if (!CSS.supports('color', value)) return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const pixel = context.getImageData(0, 0, 1, 1).data
  const red = pixel[0] / 255
  const green = pixel[1] / 255
  const blue = pixel[2] / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0
  if (delta > 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6
    else if (maximum === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
  }
  return {
    hue: (hue * 60 + 360) % 360,
    saturation: maximum === 0 ? 0 : delta / maximum,
    brightness: maximum,
    alpha: pixel[3] / 255,
  }
}

/** 将 HSV 坐标编码为 HEX，非不透明颜色保留 alpha 通道。 */
export function pickerColorToHex(color: PickerColor): string {
  const chroma = color.brightness * color.saturation
  const sector = color.hue / 60
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = color.brightness - chroma
  const channels =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const bytes = channels.map((channel) => Math.round((channel + offset) * 255))
  if (color.alpha < 1) bytes.push(Math.round(color.alpha * 255))
  return `#${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
