/** VIDYA 的计算和 Plot 声明。 */
import { calcVIDYAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'vidya',
  displayName: 'vidya',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showVIDYA: active }) },
  plots: singleLinePlots({
    id: 'vidya',
    label: 'VIDYA',
    show: 'showVIDYA',
    color: (c) => c.palette.i4,
  }),
  scale: { indicatorKey: 'vidya', label: 'VIDYA', decimals: 2 },
  presentation: { defaultOptions: { showVIDYA: true } },
  runtime: {
    defaultParams: { period: 14, cmoPeriod: 9 },
    computeKey: 'calcVIDYAData',
    compute: (data, c) => calcVIDYAData(data, c.period, c.cmoPeriod),
  },
})
export class VIDYADefinition {
  static rendererFactory = plotRenderer('vidya', 'main')
}
