/** K 线原生比较绘制层：叠加比较折线和共同 0% 基准线，不替换主品种蜡烛。 */

import { primitiveSink, submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import { RENDERER_PRIORITY, type RenderContext } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { Layer } from '../../rendering/scene/types.js'
import { COMPARISON_LINE_LAYER_ID } from './rendererIds.js'

/** 创建 K 线主图比较 Layer，数据计算由共享比较投影负责。 */
export function createComparisonLineLayer(): Layer<RenderContext> {
  return {
    kind: 'draw-list',
    id: COMPARISON_LINE_LAYER_ID,
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN + 2,
    visible: true,
    paint(context) {
      const projection = context.comparisonProjection
      if (context.dataView !== ChartDataViewId.KLine || context.pane.id !== 'main' || !projection)
        return
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const commands: PaintPrimitive[] = []

      // 基准横跨整个内容区，包括品种尚无数据的时间段，不补造行情折线。
      const baselineY = context.pane.yAxis.priceToY(projection.basePrice)
      if (Number.isFinite(baselineY)) {
        commands.push({
          kind: 'stroke',
          paths: [
            [
              { x: 0, y: baselineY },
              { x: context.paneWidth, y: baselineY },
            ],
          ],
          color: colors.referenceLine.neutral,
          width: 1 / context.dpr,
          dash: [4, 4],
        })
      }

      for (const series of projection.series) {
        if (context.comparisonHidden?.get(series.identity) === true) continue
        const points = series.points.map((point) => ({
          x:
            (context.kLineCenters[point.index - context.range.start] ?? Number.NaN) -
            context.scrollLeft,
          y: point.price === null ? Number.NaN : context.pane.yAxis.priceToY(point.price),
        }))
        commands.push(
          ...buildStrip(
            points,
            context.comparisonColors?.get(series.identity) ?? colors.palette.i2,
            Math.max(1, 1.5 / context.dpr),
          ),
        )
      }
      submitPrimitives(context, commands, context.dpr)
    },
    dispose() {},
  }
}

/** 将缺口分隔的比较线转换为有序原语，单点仍显示为圆点。 */
function buildStrip(
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
  width: number,
): PaintPrimitive[] {
  const commands: PaintPrimitive[] = []
  let segment: Array<{ x: number; y: number }> = []
  const flush = (): void => {
    const first = segment[0]
    if (first)
      commands.push(
        segment.length === 1
          ? { kind: 'circle', x: first.x, y: first.y, radius: Math.max(1.5, width), color }
          : { kind: 'stroke', paths: [segment], color, width },
      )
    segment = []
  }
  for (const point of points) {
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) segment.push(point)
    else flush()
  }
  flush()
  return commands
}

/** 绘制一条折线，数据缺口断开路径，单个有效点仍以圆点显示。 */
export function strokeStrip(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
): void {
  primitiveSink()(ctx, buildStrip(points, color, ctx.lineWidth), 1)
}
