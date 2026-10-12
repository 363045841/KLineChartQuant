/** HMA 的计算和 Plot 声明。 */
import { calcHMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'hma',
  displayName: 'HMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showHMA: active }) },
  plots: singleLinePlots({ id: 'hma', label: 'HMA', show: 'showHMA', color: (c) => c.palette.i4 }),
  scale: { indicatorKey: 'hma', label: 'HMA', decimals: 2 },
  presentation: { defaultOptions: { showHMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcHMAData',
    compute: (data, c) => calcHMAData(data, c.period),
  },
})
export class HMADefinition {
  static rendererFactory = plotRenderer('hma', 'main')
}
