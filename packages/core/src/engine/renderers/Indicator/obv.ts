/** OBV 的计算和 Plot 声明。 */
import { calcOBVData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'obv',
  displayName: 'OBV',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  defaultPaneId: 'sub_OBV',
  plots: singleLinePlots({ id: 'obv', label: 'OBV', show: 'showOBV', color: (c) => c.palette.i3 }),
  scale: { indicatorKey: 'obv', label: 'OBV', decimals: 0 },
  presentation: { defaultOptions: { showOBV: true } },
  runtime: { defaultParams: {}, computeKey: 'calcOBVData', compute: (data) => calcOBVData(data) },
})
export class OBVIndicatorDefinition {
  static rendererFactory = plotRenderer('obv')
}
