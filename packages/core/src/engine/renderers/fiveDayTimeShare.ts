/** 五日分时主图 Layer，按交易日独立绘制价格、均价、面积和昨收线。 */

import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import type { TimeShareData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import { ChartDataViewId, resolveFiveDayTimeShareBaseline } from '../chartModel/index.js'
import { Indicator, resolveIndicatorLayerId } from '../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../indicators/indicatorMetadata.js'
import { drawAreaFill, drawPreCloseLine, drawSegmentLine } from './timeShareCommon.js'

/** 五日分时主图 Layer：按共享日边界绘制，避免相邻交易日之间产生连线。 */
export function createFiveDayTimeShareLayer(): Layer<RenderContext> {
  return {
    id: resolveIndicatorLayerId(ChartDataViewId.FiveDayTimeShare, 'main'),
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    paint(context) {
      if (context.dataView !== ChartDataViewId.FiveDayTimeShare) return
      const timeShareRange = context.timeShareRange
      const geometry = context.fiveDayTimeShareGeometry
      const tsData = context.data as TimeShareData[]
      if (!timeShareRange || !geometry || tsData.length === 0) return

      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const { ctx, pane, dpr, range, kLineCenters, scrollLeft } = context
      const baseline = resolveFiveDayTimeShareBaseline(timeShareRange)

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.beginPath()
      ctx.rect(scrollLeft, 0, context.paneWidth, pane.height)
      ctx.clip()

      for (let dayIndex = 0; dayIndex < geometry.days.length; dayIndex++) {
        const dayGeometry = geometry.days[dayIndex]!
        if (baseline !== null) {
          drawPreCloseLine(
            ctx,
            [dayGeometry.startX, dayGeometry.endX],
            pane.yAxis.priceToY(baseline),
            dpr,
            colors.timeSharePreClose,
          )
        }

        const start = Math.max(range.start, dayGeometry.dataStartIndex)
        const end = Math.min(range.end, dayGeometry.dataEndIndex, tsData.length)
        const xPositions: number[] = []
        const yPrices: number[] = []
        const yAvgs: number[] = []
        for (let dataIndex = start; dataIndex < end; dataIndex++) {
          const point = tsData[dataIndex]
          const x = kLineCenters[dataIndex - range.start]
          if (!point || x === undefined) continue
          xPositions.push(x)
          yPrices.push(pane.yAxis.priceToY(point.price))
          yAvgs.push(pane.yAxis.priceToY(point.average))
        }
        if (xPositions.length < 2) continue

        if (baseline !== null) {
          drawAreaFill(
            ctx,
            xPositions,
            yPrices,
            pane.yAxis.priceToY(baseline),
            dpr,
            colors.timeShareAreaUp,
            colors.timeShareAreaDown,
          )
        }
        drawSegmentLine(ctx, xPositions, yPrices, dpr, colors.timeSharePriceLine, 1)
        drawSegmentLine(ctx, xPositions, yAvgs, dpr, colors.timeShareAvgLine, 1)
      }

      ctx.restore()
    },
    dispose() {},
  }
}

@Indicator({
  name: ChartDataViewId.FiveDayTimeShare,
  displayName: '五日分时',
  category: 'main',
  indicatorType: 'other',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.FiveDayTimeShare],
  kind: IndicatorKind.System,
  mainPane: {},
})
export class FiveDayTimeShareIndicatorDefinition {
  static rendererFactory = createFiveDayTimeShareLayer
}
