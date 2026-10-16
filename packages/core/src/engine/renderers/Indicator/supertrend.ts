/** SuperTrend 的分色 Plot 声明。 */
import { calcSuperTrendData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { readPlotField } from '@/engine/plots/impl/projectPlots.js'
@Indicator({
  name: 'supertrend',
  displayName: 'SuperTrend',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'trend',
  defaultPaneId: 'sub_SuperTrend',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showSuperTrend: active }) },
  scale: { indicatorKey: 'supertrend', label: 'SuperTrend', decimals: 2 },
  plots: {
    series: [
      {
        id: 'supertrend',
        label: 'ST',
        field: 'value',
        show: 'showSuperTrend',
        color: (c) => c.candleUpBody,
        pointColor: (_value, _previous, c, raw) =>
          readPlotField(raw, 'trend') === 'up' ? c.candleUpBody : c.candleDownBody,
      },
    ],
  },
  presentation: { defaultOptions: { showSuperTrend: true } },
  runtime: {
    defaultParams: { atrPeriod: 10, multiplier: 3 },
    computeKey: 'calcSuperTrendData',
    compute: (data, c) => calcSuperTrendData(data, c.atrPeriod, c.multiplier),
  },
})
export class SuperTrendIndicatorDefinition {
  static rendererFactory = plotRenderer('supertrend')
}
