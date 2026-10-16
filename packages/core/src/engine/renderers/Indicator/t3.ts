/** T3 的计算和 Plot 声明。 */
import { calcT3Data } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 't3',
  displayName: 't3',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showT3: active }) },
  plots: singleLinePlots({ id: 't3', label: 'T3', show: 'showT3', color: (c) => c.palette.i3 }),
  scale: { indicatorKey: 't3', label: 'T3', decimals: 2 },
  presentation: { defaultOptions: { showT3: true } },
  runtime: {
    defaultParams: { period: 5, volumeFactor: 0.7 },
    computeKey: 'calcT3Data',
    compute: (data, c) => calcT3Data(data, c.period, c.volumeFactor),
  },
})
export class T3Definition {
  static rendererFactory = plotRenderer('t3')
}
