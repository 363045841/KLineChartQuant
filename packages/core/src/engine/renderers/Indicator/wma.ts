/** WMA 的计算和 Plot 声明。 */
import { calcWMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'wma',
  displayName: 'WMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showWMA: active }) },
  plots: singleLinePlots({ id: 'wma', label: 'WMA', show: 'showWMA', color: (c) => c.palette.i3 }),
  scale: { indicatorKey: 'wma', label: 'WMA', decimals: 2 },
  presentation: { defaultOptions: { showWMA: true } },
  runtime: {
    defaultParams: { period: 10 },
    computeKey: 'calcWMAData',
    compute: (data, c) => calcWMAData(data, c.period),
  },
})
export class WMADefinition {
  static rendererFactory = plotRenderer('wma', 'main')
}
