/** PVT 的计算和 Plot 声明。 */
import { calcPVTData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'pvt',
  displayName: 'PVT',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_PVT',
  plots: singleLinePlots({ id: 'pvt', label: 'PVT', show: 'showPVT', color: (c) => c.palette.i8 }),
  scale: { indicatorKey: 'pvt', label: 'PVT', decimals: 0 },
  presentation: { defaultOptions: { showPVT: true } },
  runtime: { defaultParams: {}, computeKey: 'calcPVTData', compute: (data) => calcPVTData(data) },
})
export class PVTIndicatorDefinition {
  static rendererFactory = plotRenderer('pvt', 'sub_PVT')
}
