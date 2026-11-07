/** 最新价 label 注册与点虚线 Layer 工厂（overlay 层，绘制到主图）。 */

import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import { Indicator } from '../indicators/indicatorDecorator.js'
import { resolveIndicatorLayerId } from '../indicators/indicatorLayerNaming.js'
import { IndicatorKind } from '../indicators/indicatorMetadata.js'
import { formatAxisPriceValue, usesPercentAxis } from './axisValueFormat.js'
import { registerAxisLabel } from './impl/labels/index.js'

function getLastPriceInfo(context: Omit<RenderContext, 'ctx'>) {
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
    kind: 'draw-list',
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
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  kind: IndicatorKind.System,
  mainPane: {},
})
export class LastPriceLabelRegistrarIndicatorDefinition {
  static rendererFactory = createLastPriceLabelLayer
}

/** 点虚线样式：1 个点 + 3 个间隔，圆头线帽让短划呈现为点。 */
const LAST_PRICE_LINE_DASH = [1, 3]

/**
 * 最新价点虚线 Layer（绘制点虚线）。
 */
export function createLastPriceLineLayer(): Layer<RenderContext> {
  return {
    kind: 'draw-list',
    id: resolveIndicatorLayerId('lastPriceLine', 'main'),
    role: 'overlay',
    pane: 'main',
    z: RENDERER_PRIORITY.LAST_PRICE_LABEL,
    visible: true,
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const { dpr, paneWidth } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const info = getLastPriceInfo(context)
      if (!info) return

      const y = info.y

      const yy = (Math.floor(y * dpr) + 0.5) / dpr
      submitPrimitives(
        context,
        [
          {
            kind: 'stroke',
            paths: [
              [
                { x: 0, y: yy },
                { x: paneWidth, y: yy },
              ],
            ],
            color: info.isUp ? colors.candleUpBorder : colors.candleDownBorder,
            width: 1,
            cap: 'round',
            dash: LAST_PRICE_LINE_DASH,
          },
        ],
        dpr,
      )
    },
    dispose() {},
  }
}

@Indicator({
  name: 'lastPriceLine',
  displayName: '最新价点虚线',
  category: 'main',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  kind: IndicatorKind.System,
  mainPane: {},
})
export class LastPriceLineIndicatorDefinition {
  static rendererFactory = createLastPriceLineLayer
}
