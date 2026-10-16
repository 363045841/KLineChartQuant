/** LSMA 的计算和 Plot 声明。 */
import { calcLSMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'lsma',
  displayName: 'LSMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showLSMA: active }) },
  plots: singleLinePlots({
    id: 'lsma',
    label: 'LSMA',
    show: 'showLSMA',
    color: (c) => c.palette.i7,
  }),
  scale: { indicatorKey: 'lsma', label: 'LSMA', decimals: 2 },
  presentation: { defaultOptions: { showLSMA: true } },
  runtime: {
    defaultParams: { period: 25 },
    computeKey: 'calcLSMAData',
    compute: (data, c) => calcLSMAData(data, c.period),
  },
})
export class LSMADefinition {
  static rendererFactory = plotRenderer('lsma')
}
