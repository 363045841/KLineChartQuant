/** TEMA 的计算和 Plot 声明。 */
import { calcTEMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'tema',
  displayName: 'TEMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showTEMA: active }) },
  plots: singleLinePlots({
    id: 'tema',
    label: 'TEMA',
    show: 'showTEMA',
    color: (c) => c.palette.i4,
  }),
  scale: { indicatorKey: 'tema', label: 'TEMA', decimals: 2 },
  presentation: { defaultOptions: { showTEMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcTEMAData',
    compute: (data, c) => calcTEMAData(data, c.period),
  },
})
export class TEMADefinition {
  static rendererFactory = plotRenderer('tema')
}
