/** 最新价轴标签的倒计时布局及文字绘制。 */
import { roundToPhysicalPixel } from '@/foundation/utils/pixelAlign.js'

const PADDING = 4

/** 两行文字之间、文字与上下边缘均留相同的间距。 */
export function getLastPriceLabelHeight(fontSize: number): number {
  return fontSize * 2 + PADDING * 3
}

/** 在已设置好字体、颜色和居中基线的上下文中绘制价格及倒计时。 */
export function paintLastPriceLabelText(
  ctx: CanvasRenderingContext2D,
  price: string,
  countdown: string,
  centerX: number,
  centerY: number,
  fontSize: number,
  dpr: number,
): void {
  const lineOffset = (fontSize + PADDING) / 2
  const x = roundToPhysicalPixel(centerX, dpr)
  ctx.fillText(price, x, roundToPhysicalPixel(centerY - lineOffset, dpr))
  ctx.globalAlpha *= 0.7
  ctx.fillText(countdown, x, roundToPhysicalPixel(centerY + lineOffset, dpr))
}
