/** 最新价 label 注册与虚线 Layer 工厂（overlay 层，绘制到主图）。 */
import type { RenderContext } from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import { Indicator, resolveIndicatorLayerId } from '../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../indicators/indicatorMetadata.js'
import { formatAxisPriceValue, usesPercentAxis } from './axisValueFormat.js'
import { registerAxisLabel } from './impl/labels/index.js'

function getLastPriceInfo(context: RenderContext) {
  const { pane, data } = context
  const klineData = data as KLineData[]
  const last = klineData[klineData.length - 1]
  if (!last) return null

  const displayRange = pane.yAxis.getDisplayRange()
  if (last.close < displayRange.minPrice || last.close > displayRange.maxPrice) {
    return null
  }

  // 涨跌以前收为基准；无前收（仅一根 K 线）时回退到当根开盘价。
  const previous = klineData[klineData.length - 2]
  const baseline = previous ? previous.close : last.open

  return {
    price: last.close,
    timestamp: last.timestamp,
    y: Math.round(pane.yAxis.priceToY(last.close)),
    isUp: last.close >= baseline,
  }
}

/**
 * 最新价 label 注册 Layer（overlay 层，确保悬停时 label 也注册到右轴 overlay 表面）。
 */
export function createLastPriceLabelLayer(): Layer<RenderContext> {
  return {
    id: resolveIndicatorLayerId('lastPriceLabelRegistrar', 'main'),
    role: 'overlay',
    pane: 'main',
    z: RENDERER_PRIORITY.LAST_PRICE_LABEL,
    visible: true,
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const info = getLastPriceInfo(context)
      if (!info) return

      // 标签文本跟随轴展示语义：百分比轴显示涨跌幅，否则显示价格。
      const isPercent = usesPercentAxis(context)
      const displayValue = isPercent ? context.pane.yAxis.toPercent(info.price) : info.price

      registerAxisLabel(context, 'yRightOverlay', {
        kind: AXIS_LABEL_KIND.TAG,
        type: 'lastPrice',
        text: formatAxisPriceValue(displayValue, isPercent),
        countdown: context.countdown,
        pos: info.y + context.pane.top,
        origin: context.pane.top,
        variant: 'label',
        // 价格标签色块跟随涨跌，文字取通用标签文字色保证对比度。
        bgColor: info.isUp ? colors.candleUpBody : colors.candleDownBody,
        borderColor: info.isUp ? colors.candleUpBorder : colors.candleDownBorder,
        textColor: colors.label.text,
        fontSize: 12,
      })
    },
    dispose() {},
  }
}

@Indicator({
  name: 'lastPriceLabelRegistrar',
  displayName: '最新价标签注册',
  category: 'main',
  indicatorType: 'other',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  kind: IndicatorKind.System,
  mainPane: {},
})
export class LastPriceLabelRegistrarIndicatorDefinition {
  static rendererFactory = createLastPriceLabelLayer
}

/**
 * 最新价虚线 Layer（绘制虚线）。
 */
export function createLastPriceLineLayer(): Layer<RenderContext> {
  return {
    id: resolveIndicatorLayerId('lastPriceLine', 'main'),
    role: 'overlay',
    pane: 'main',
    z: RENDERER_PRIORITY.LAST_PRICE_LABEL,
    visible: true,
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const { overlayCtx, scrollLeft, dpr, paneWidth } = context
      const ctx = overlayCtx
      if (!ctx) return
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const info = getLastPriceInfo(context)
      if (!info) return

      const y = info.y

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      // 最新价水平线横贯整个视口（从左边缘到右边缘）
      const startX = scrollLeft
      const endX = paneWidth + scrollLeft

      ctx.strokeStyle = info.isUp ? colors.candleUpBorder : colors.candleDownBorder
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      const yy = (Math.floor(y * dpr) + 0.5) / dpr
      ctx.moveTo(Math.round(startX * dpr) / dpr, yy)
      ctx.lineTo(Math.round(endX * dpr) / dpr, yy)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.restore()
    },
    dispose() {},
  }
}

@Indicator({
  name: 'lastPriceLine',
  displayName: '最新价虚线',
  category: 'main',
  indicatorType: 'other',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  kind: IndicatorKind.System,
  mainPane: {},
})
export class LastPriceLineIndicatorDefinition {
  static rendererFactory = createLastPriceLineLayer
}
