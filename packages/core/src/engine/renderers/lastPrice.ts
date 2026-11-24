/** 最新价点虚线 Layer（overlay 层，绘制到主图）；价签由轴标签模块统一产出。 */

import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'

/** 最新价在本帧的位置与涨跌方向；价签与虚线共用同一份取值规则。 */
interface LastPriceInfo {
  readonly price: number
  readonly timestamp: number
  readonly y: number
  readonly isUp: boolean
}

/**
 * 计算最新价信息：只保留落在当前可见价格范围内的最后一根 K 线。
 *
 * @param context 当前渲染上下文
 * @returns 最新价信息；无数据或价格不在显示范围内时为 null
 */
function getLastPriceInfo(context: Omit<RenderContext, 'ctx'>): LastPriceInfo | null {
  const { pane, data } = context
  const klineData = data as KLineData[]
  const last = klineData[klineData.length - 1]
  if (!last) return null

  const displayRange = pane.yAxis.getDisplayRange()
  if (last.close < displayRange.minPrice || last.close > displayRange.maxPrice) return null

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

/** 点虚线样式：1 个点 + 3 个间隔，圆头线帽让短划呈现为点。 */
const LAST_PRICE_LINE_DASH = [1, 3]

/**
 * 最新价点虚线 Layer（绘制点虚线）。
 *
 * @param paneId 所属 Pane
 */
export function createLastPriceLineLayer(paneId: string): Layer<RenderContext> {
  return {
    kind: 'draw-list',
    id: makePluginLayerId('lastPriceLine'),
    role: 'overlay',
    pane: paneId,
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

      const yy = (Math.floor(info.y * dpr) + 0.5) / dpr
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
