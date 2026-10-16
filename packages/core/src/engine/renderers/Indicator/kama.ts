/** KAMA 的计算和 Plot 声明。 */
import { calcKAMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'kama',
  displayName: 'KAMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showKAMA: active }) },
  plots: singleLinePlots({
    id: 'kama',
    label: 'KAMA',
    show: 'showKAMA',
    color: (c) => c.palette.i6,
  }),
  scale: { indicatorKey: 'kama', label: 'KAMA', decimals: 2 },
  presentation: { defaultOptions: { showKAMA: true } },
  runtime: {
    defaultParams: { period: 10, fastPeriod: 2, slowPeriod: 30 },
    computeKey: 'calcKAMAData',
    compute: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  },
})
export class KAMADefinition {
  static rendererFactory = plotRenderer('kama')
}
