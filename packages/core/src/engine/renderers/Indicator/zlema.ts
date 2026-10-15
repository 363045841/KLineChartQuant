/** ZLEMA 的计算和 Plot 声明。 */
import { calcZLEMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'zlema',
  displayName: 'ZLEMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showZLEMA: active }) },
  plots: singleLinePlots({
    id: 'zlema',
    label: 'ZLEMA',
    show: 'showZLEMA',
    color: (c) => c.palette.i6,
  }),
  scale: { indicatorKey: 'zlema', label: 'ZLEMA', decimals: 2 },
  presentation: { defaultOptions: { showZLEMA: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcZLEMAData',
    compute: (data, c) => calcZLEMAData(data, c.period),
  },
})
export class ZLEMADefinition {
  static rendererFactory = plotRenderer('zlema', 'main')
}
