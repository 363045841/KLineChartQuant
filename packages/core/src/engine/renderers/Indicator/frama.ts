/** FRAMA 的计算和 Plot 声明。 */
import { calcFRAMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'frama',
  displayName: 'frama',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showFRAMA: active }) },
  plots: singleLinePlots({
    id: 'frama',
    label: 'FRAMA',
    show: 'showFRAMA',
    color: (c) => c.palette.i5,
  }),
  scale: { indicatorKey: 'frama', label: 'FRAMA', decimals: 2 },
  presentation: { defaultOptions: { showFRAMA: true } },
  runtime: {
    defaultParams: { period: 16 },
    computeKey: 'calcFRAMAData',
    compute: (data, c) => calcFRAMAData(data, c.period),
  },
})
export class FRAMADefinition {
  static rendererFactory = plotRenderer('frama')
}
