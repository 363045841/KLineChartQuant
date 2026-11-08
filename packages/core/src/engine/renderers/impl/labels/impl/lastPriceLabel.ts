/** 最新价轴标签的倒计时布局及文字绘制。 */
import { roundToPhysicalPixel } from '@/foundation/utils/pixelAlign.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import type { TextPaintPrimitive } from '@/rendering/primitives/types.js'

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
  primitiveSink()(
    ctx,
    buildLastPriceLabelText(
      {
        kind: 'text',
        text: price,
        x: centerX,
        y: centerY,
        font: ctx.font,
        color: String(ctx.fillStyle),
        align: 'center',
        baseline: 'middle',
      },
      countdown,
      fontSize,
      dpr,
    ),
    dpr,
  )
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
