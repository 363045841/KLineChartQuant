/** DEMA 的计算和 Plot 声明。 */
import { calcDEMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'dema',
  displayName: 'DEMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showDEMA: active }) },
  plots: singleLinePlots({
    id: 'dema',
    label: 'DEMA',
    show: 'showDEMA',
    color: (c) => c.palette.i9,
  }),
  scale: { indicatorKey: 'dema', label: 'DEMA', decimals: 2 },
  presentation: { defaultOptions: { showDEMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcDEMAData',
    compute: (data, c) => calcDEMAData(data, c.period),
  },
})
export class DEMADefinition {
  static rendererFactory = plotRenderer('dema')
}
