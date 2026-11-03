/** 周期主序列的收盘价折线与面积：保留 K 线时间槽位，不引入分时昨收或均价语义。 */
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive, PrimitivePoint } from '@/rendering/primitives/types.js'

/** 将有效收盘价按时间顺序连线；缺值断开，面积闭合至绘图区底部而非零价格。 */
export function paintCloseSeries(context: PrimitiveRenderContext, shape: 'line' | 'area'): void {
  const { data, range, pane, kLineCenters } = context
  const paths: PrimitivePoint[][] = []
  let path: PrimitivePoint[] = []
  for (let index = Math.max(0, range.start); index < Math.min(range.end, data.length); index++) {
    const bar = data[index]
    const x = kLineCenters[index - range.start]
    const close = bar && 'close' in bar ? bar.close : NaN
    const y = pane.yAxis.priceToY(close)
    if (x === undefined || !Number.isFinite(close) || !Number.isFinite(y)) {
      if (path.length) paths.push(path)
      path = []
      continue
    }
    path.push({ x, y })
  }
  if (path.length) paths.push(path)
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const color = colors.timeSharePriceLine
  const bottom = pane.yAxis.getContentBottom()
  const commands: PaintPrimitive[] = []
  if (shape === 'area') {
    for (const points of paths) {
      if (points.length < 2) continue
      commands.push({
        kind: 'fill',
        paths: [
          [
            ...points,
            ...points
              .slice()
              .reverse()
              .map(({ x }) => ({ x, y: bottom })),
          ],
        ],
        band: true,
        color,
        opacity: 0.4,
        fade: { fromY: pane.yAxis.getContentTop(), toY: bottom },
        offsetX: context.scrollLeft,
      })
    }
  }
  commands.push({
    kind: 'stroke',
    paths,
    color,
    width: 2,
    join: 'round',
    cap: 'round',
    offsetX: context.scrollLeft,
  })
  submitPrimitives(context, commands, context.dpr)
}
