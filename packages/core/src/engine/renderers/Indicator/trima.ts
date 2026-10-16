/** TRIMA 的计算和 Plot 声明。 */
import { calcTRIMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'trima',
  displayName: 'TRIMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showTRIMA: active }) },
  plots: singleLinePlots({
    id: 'trima',
    label: 'TRIMA',
    show: 'showTRIMA',
    color: (c) => c.palette.i5,
  }),
  scale: { indicatorKey: 'trima', label: 'TRIMA', decimals: 2 },
  presentation: { defaultOptions: { showTRIMA: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcTRIMAData',
    compute: (data, c) => calcTRIMAData(data, c.period),
  },
})
export class TRIMADefinition {
  static rendererFactory = plotRenderer('trima')
}
