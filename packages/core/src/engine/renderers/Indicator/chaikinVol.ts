/** ChaikinVol 的计算和 Plot 声明。 */
import { calcChaikinVolData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'chaikinVol',
  displayName: 'ChaikinVol',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_ChaikinVol',
  plots: {
    series: [
      { id: 'chaikinVol', label: 'ChaikinVol', show: 'showChaikinVol', color: (c) => c.palette.i2 },
    ],
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  scale: { indicatorKey: 'chaikinVol', label: 'ChaikinVol', decimals: 2 },
  presentation: { defaultOptions: { showChaikinVol: true } },
  runtime: {
    defaultParams: { emaPeriod: 10, rocPeriod: 10 },
    computeKey: 'calcChaikinVolData',
    compute: (data, c) => calcChaikinVolData(data, c.emaPeriod, c.rocPeriod),
  },
})
export class ChaikinVolIndicatorDefinition {
  static rendererFactory = plotRenderer('chaikinVol')
}
