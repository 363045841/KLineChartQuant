/** KDJ 的三条 Plot 声明。 */
import { ChartDataViewId } from '@/engine/chartModel/index.js'
import { calcSTOCHData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createStochScaleLayer } from './scale/stoch_scale.js'
@Indicator({
  name: 'stoch',
  displayName: 'KDJ',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_STOCH',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare, ChartDataViewId.FiveDayTimeShare],
  scaleRendererFactory: createStochScaleLayer,
  plots: {
    series: [
      { id: 'k', label: 'K', field: 'k', show: 'showK', color: (c) => c.kdj.k },
      { id: 'd', label: 'D', field: 'd', show: 'showD', color: (c) => c.kdj.d },
      { id: 'j', label: 'J', field: 'j', show: 'showJ', color: (c) => c.kdj.j },
    ],
    guides: [80, 50, 20].map((value) => ({ value, color: (c) => c.kdj.guide })),
  },
  presentation: { defaultOptions: { showK: true, showD: true, showJ: true } },
  runtime: {
    defaultParams: { n: 9, m: 3 },
    computeKey: 'calcSTOCHData',
    compute: (data, c) => calcSTOCHData(data, c.n, c.m),
  },
})
export class STOCHIndicatorDefinition {
  static rendererFactory = plotRenderer('stoch', 'sub_STOCH')
}
