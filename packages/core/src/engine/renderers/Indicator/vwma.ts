/** VWMA 的计算和 Plot 声明。 */
import { calcVWMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'vwma',
  displayName: 'VWMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showVWMA: active }) },
  plots: singleLinePlots({
    id: 'vwma',
    label: 'VWMA',
    show: 'showVWMA',
    color: (c) => c.palette.i8,
  }),
  scale: { indicatorKey: 'vwma', label: 'VWMA', decimals: 2 },
  presentation: { defaultOptions: { showVWMA: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcVWMAData',
    compute: (data, c) => calcVWMAData(data, c.period),
  },
})
export class VWMADefinition {
  static rendererFactory = plotRenderer('vwma')
}
