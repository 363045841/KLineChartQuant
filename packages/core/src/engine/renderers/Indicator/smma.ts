/** SMMA 的计算和 Plot 声明。 */
import { calcSMMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'smma',
  displayName: 'SMMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showSMMA: active }) },
  plots: singleLinePlots({
    id: 'smma',
    label: 'SMMA',
    show: 'showSMMA',
    color: (c) => c.palette.i8,
  }),
  scale: { indicatorKey: 'smma', label: 'SMMA', decimals: 2 },
  presentation: { defaultOptions: { showSMMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcSMMAData',
    compute: (data, c) => calcSMMAData(data, c.period),
  },
})
export class SMMADefinition {
  static rendererFactory = plotRenderer('smma')
}
