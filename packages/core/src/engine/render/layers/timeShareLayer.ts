/** 分时主图 Layer（仅 TimeShare dataView）。 */

import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import type { TimeShareData } from '@/foundation/types/price.js'
import type { Renderer } from '@/rendering/render/Renderer.js'
import type { Layer } from '@/rendering/scene/types.js'
import { resolveTimeShareBaseline } from '../../modes/index.js'
import { drawAreaFill, drawPreCloseLine, drawSegmentLine } from './timeShareCommon.js'

/** 分时主图 Layer：按可见范围绘制价格线、均价线与昨收基线。 */
export function createTimeShareLayer(
  getContext: () => RenderContext | null,
  getSceneRenderer: () => Renderer,
): Layer<RenderContext> {
  return {
    id: 'plugin:timeShare',
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    paint() {
      const context = getContext()
      if (!context) return
      context.sceneRenderer = getSceneRenderer()
      drawTimeShare(context)
    },
    dispose() {},
  }
}

/** 分时绘制体。 */
function drawTimeShare(context: RenderContext): void {
  const { ctx, pane, data, range, dpr, kLineCenters, scrollLeft, settings } = context
  if (context.dataView !== ChartDataViewId.TimeShare) return
  const tsData = data as TimeShareData[]
  if (!tsData.length) return

  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const preClose = resolveTimeShareBaseline({
    preClose: settings?.preClose as number | undefined,
    firstPrice: tsData[0]?.price,
  })
  if (preClose === null) return

  const { start, end } = range
  const itemCount = Math.min(end, tsData.length) - start

  const xPositions: number[] = []
  const yPrices: number[] = []
  const yAvgs: number[] = []
  for (let i = start; i < start + itemCount; i++) {
    const item = tsData[i]
    if (!item) continue
    const x = kLineCenters[i - start]
    if (x === undefined) continue
    xPositions.push(x)
    yPrices.push(pane.yAxis.priceToY(item.price))
    yAvgs.push(pane.yAxis.priceToY(item.average))
  }

  if (xPositions.length < 2) return

  ctx.save()
  ctx.translate(-scrollLeft, 0)

  const preCloseY = pane.yAxis.priceToY(preClose)

  ctx.save()
  ctx.beginPath()
  ctx.rect(scrollLeft, 0, context.paneWidth, pane.height)
  ctx.clip()

  drawPreCloseLine(ctx, xPositions, preCloseY, dpr, colors.timeSharePreClose)

  drawAreaFill(
    ctx,
    xPositions,
    yPrices,
    preCloseY,
    dpr,
    colors.timeShareAreaUp,
    colors.timeShareAreaDown,
  )

  drawSegmentLine(ctx, xPositions, yPrices, dpr, colors.timeSharePriceLine, 1)

  drawSegmentLine(ctx, xPositions, yAvgs, dpr, colors.timeShareAvgLine, 1)
  ctx.restore()

  ctx.restore()
}
