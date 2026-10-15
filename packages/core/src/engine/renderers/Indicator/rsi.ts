/** RSI 的三条 Plot、固定轴范围和参考线声明。 */
import { ChartDataViewId } from '@/engine/chartModel/index.js'
import { calcRSIData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createRsiScaleLayer } from './scale/rsi_scale.js'
@Indicator({
  name: 'rsi',
  displayName: 'RSI',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_RSI',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare, ChartDataViewId.FiveDayTimeShare],
  scaleRendererFactory: createRsiScaleLayer,
  plots: {
    series: [
      {
        id: 'rsi1',
        label: (p) => `RSI${p.period1}`,
        periodParam: 'period1',
        show: 'showRSI1',
        color: (c) => c.rsi.rsi1,
      },
      {
        id: 'rsi2',
        label: (p) => `RSI${p.period2}`,
        periodParam: 'period2',
        show: 'showRSI2',
        color: (c) => c.rsi.rsi2,
      },
      {
        id: 'rsi3',
        label: (p) => `RSI${p.period3}`,
        periodParam: 'period3',
        show: 'showRSI3',
        color: (c) => c.rsi.rsi3,
      },
    ],
    range: { min: 0, max: 100 },
    guides: [80, 50, 20].map((value) => ({ value, color: (c) => c.rsi.guide })),
  },
  presentation: { defaultOptions: { showRSI1: true, showRSI2: true, showRSI3: true } },
  runtime: {
    defaultParams: { period1: 6, period2: 12, period3: 24 },
    computeKey: 'calcRSIData',
    compute: (data, c) => {
      const result: Record<number, (number | undefined)[]> = {}
      for (const period of [c.period1, c.period2, c.period3])
        result[period] = calcRSIData(data, period)
      return result
    },
  },
})
export class RSIIndicatorDefinition {
  static rendererFactory = plotRenderer('rsi', 'sub_RSI')
}
