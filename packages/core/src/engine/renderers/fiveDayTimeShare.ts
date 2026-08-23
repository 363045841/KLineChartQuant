/** 五日分时主图 renderer，按交易日独立绘制价格、均价、面积和昨收线。 */
import type {
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import type { TimeShareData } from '../../foundation/types/price'
import { Indicator } from '../indicators/indicatorDefinitionRegistry'
import { resolveFiveDayTimeShareBaseline } from '../modes/timeShareMath'
import { ChartDataViewId } from '../state/modeState'
import { drawAreaFill, drawPreCloseLine, drawSegmentLine } from './timeShare'

/** 创建仅服务 fiveDayTimeShare dataView 的主序列 renderer。 */
export function createFiveDayTimeShareRendererPlugin(): RendererPluginWithHost {
  return {
    name: ChartDataViewId.FiveDayTimeShare,
    version: '1.0.0',
    description: '五日分时图渲染器',
    debugName: '五日分时图',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN,

    /** 保留 renderer plugin 生命周期契约。 */
    onInstall(_host: PluginHost) {},

    /** 按共享日边界绘制，避免相邻交易日之间产生连线。 */
    draw(context: RenderContext) {
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
  }
}

@Indicator({
  name: ChartDataViewId.FiveDayTimeShare,
  displayName: '五日分时',
  category: 'main',
  indicatorType: 'other',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.FiveDayTimeShare],
  mainPane: { rendererName: ChartDataViewId.FiveDayTimeShare },
})
export class FiveDayTimeShareIndicatorDefinition {
  static rendererFactory = createFiveDayTimeShareRendererPlugin
}
