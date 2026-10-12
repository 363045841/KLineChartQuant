/** MACD 的两条线和一组柱状 Plot 声明。 */
import { ChartDataViewId } from '@/engine/chartModel/index.js'
import { calcMACDData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createMacdScaleLayer } from './scale/macd_scale.js'
@Indicator({
  name: 'macd',
  displayName: 'MACD',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_MACD',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare, ChartDataViewId.FiveDayTimeShare],
  scaleRendererFactory: createMacdScaleLayer,
  plots: {
    series: [
      {
        id: 'bar',
        label: 'BAR',
        field: 'macd',
        kind: 'histogram',
        show: 'showBAR',
        color: (c) => c.macd.barUp,
        pointColor: (value, previous, c) => {
          const rising = previous === undefined || value >= previous
          return value >= 0
            ? rising
              ? c.macd.barUp
              : c.macd.barUpLight
            : rising
              ? c.macd.barDownLight
              : c.macd.barDown
        },
      },
      { id: 'dif', label: 'DIF', field: 'dif', show: 'showDIF', color: (c) => c.macd.dif },
      { id: 'dea', label: 'DEA', field: 'dea', show: 'showDEA', color: (c) => c.macd.dea },
    ],
  },
  presentation: { defaultOptions: { showDIF: true, showDEA: true, showBAR: true } },
  runtime: {
    defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    computeKey: 'calcMACDData',
    compute: (data, c) => calcMACDData(data, c.fastPeriod, c.slowPeriod, c.signalPeriod),
  },
})
export class MACDIndicatorDefinition {
  static rendererFactory = plotRenderer('macd', 'sub_MACD')
}
