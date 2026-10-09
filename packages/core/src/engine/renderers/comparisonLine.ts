/** K 线原生比较绘制层：叠加比较折线和共同 0% 基准线，不替换主品种蜡烛。 */
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import { RENDERER_PRIORITY, type RenderContext } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { Layer } from '../../rendering/scene/types.js'

/** 创建 K 线主图比较 Layer，数据计算由共享比较投影负责。 */
export function createComparisonLineLayer(): Layer<RenderContext> {
  return {
    id: makePluginLayerId('comparisonLine'),
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
      const ctx = context.ctx
      ctx.save()

      // 基准横跨整个内容区，包括品种尚无数据的时间段，不补造行情折线。
      const baselineY = context.pane.yAxis.priceToY(projection.basePrice)
      if (Number.isFinite(baselineY)) {
        ctx.lineWidth = 1 / context.dpr
        ctx.strokeStyle = colors.referenceLine.neutral
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, baselineY)
        ctx.lineTo(context.paneWidth, baselineY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.lineWidth = Math.max(1, 1.5 / context.dpr)
      for (const series of projection.series) {
        if (context.comparisonHidden?.get(series.identity) === true) continue
        const points = series.points.map((point) => ({
          x:
            (context.kLineCenters[point.index - context.range.start] ?? Number.NaN) -
            context.scrollLeft,
          y: point.price === null ? Number.NaN : context.pane.yAxis.priceToY(point.price),
        }))
        strokeStrip(
          ctx,
          points,
          context.comparisonColors?.get(series.identity) ?? colors.palette.i2,
        )
      }
      ctx.restore()
    },
    dispose() {},
  }
}

/** 绘制一条折线，数据缺口断开路径，单个有效点仍以圆点显示。 */
export function strokeStrip(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  let segment: Array<{ x: number; y: number }> = []
  /** 提交一个连续的数据片段，避免跨越真实行情缺口。 */
  function flush(): void {
    const first = segment[0]
    if (!first) return
    ctx.beginPath()
    if (segment.length === 1) {
      ctx.arc(first.x, first.y, Math.max(1.5, ctx.lineWidth), 0, 2 * Math.PI)
      ctx.fill()
    } else {
      ctx.moveTo(first.x, first.y)
      for (const point of segment.slice(1)) ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
    segment = []
  }
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) flush()
    else segment.push(point)
  }
  flush()
}
