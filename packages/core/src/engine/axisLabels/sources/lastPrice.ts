/** 最新价标签：价签 + 收盘倒计时，颜色跟随涨跌，只在 K 线视图的主价格轴上出现。 */

import { PRICE_SERIES_AXIS_ID } from '@/engine/renderers/rendererIds.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { AxisLabel, AxisLabelScope, AxisLabelSource } from '../types.js'

export const lastPriceSource: AxisLabelSource = {
  collect(scope: AxisLabelScope): readonly AxisLabel[] {
    if (scope.dataView !== ChartDataViewId.KLine) return []
    const spec = scope.axes.find((axis) => axis.axisId === PRICE_SERIES_AXIS_ID)
    if (!spec || !spec.visible) return []
    const bars = scope.data as readonly KLineData[]
    const last = bars[bars.length - 1]
    if (!last) return []
    const colors = resolveThemeColors(
      scope.theme.theme,
      scope.theme.isAsiaMarket,
      scope.theme.colorPresetSettings,
    )
    // 涨跌以前收为基准；无前收（仅一根 K 线）时回退到当根开盘价。
    const baseline = bars[bars.length - 2]?.close ?? last.open
    return [
      {
        kind: 'value',
        axisId: PRICE_SERIES_AXIS_ID,
        role: 'marker',
        value: last.close,
        background: last.close >= baseline ? colors.candleUpBody : colors.candleDownBody,
        note: scope.countdown ?? undefined,
      },
    ]
  },
}
