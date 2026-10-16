/** Parkinson 的计算和 Plot 声明。 */
import { calcParkinsonData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'parkinson',
  displayName: 'Parkinson',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_Parkinson',
  plots: singleLinePlots(
    { id: 'parkinson', label: 'Parkinson', show: 'showParkinson', color: (c) => c.palette.i6 },
    { min: 0, mode: 'clamp' },
  ),
  scale: { indicatorKey: 'parkinson', label: 'Parkinson', decimals: 2 },
  presentation: { defaultOptions: { showParkinson: true } },
  runtime: {
    defaultParams: { period: 20, annualizationFactor: 252 },
    computeKey: 'calcParkinsonData',
    compute: (data, c) => calcParkinsonData(data, c.period, c.annualizationFactor),
  },
})
export class ParkinsonIndicatorDefinition {
  static rendererFactory = plotRenderer('parkinson')
}
