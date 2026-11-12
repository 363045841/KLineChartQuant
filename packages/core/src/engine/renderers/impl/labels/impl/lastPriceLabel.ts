/** 最新价轴标签的倒计时布局及文字绘制。 */
import { roundToPhysicalPixel } from '@/foundation/utils/pixelAlign.js'
import type { TextPaintPrimitive } from '@/rendering/primitives/types.js'

const PADDING = 4

/** 两行文字之间、文字与上下边缘均留相同的间距。 */
export function getLastPriceLabelHeight(fontSize: number): number {
  return fontSize * 2 + PADDING * 3
}

/** 价格和倒计时共享标签布局，透明度写在命令里而不是继承 Canvas 状态。 */
export function buildLastPriceLabelText(
  price: TextPaintPrimitive,
  countdown: string,
  fontSize: number,
  dpr: number,
): TextPaintPrimitive[] {
  const lineOffset = (fontSize + PADDING) / 2
  const x = roundToPhysicalPixel(price.x, dpr)
  return [
    { ...price, x, y: roundToPhysicalPixel(price.y - lineOffset, dpr) },
    {
      ...price,
      text: countdown,
      x,
      y: roundToPhysicalPixel(price.y + lineOffset, dpr),
      opacity: 0.7,
    },
  ]
}
