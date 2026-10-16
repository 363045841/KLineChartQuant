/** HV 的计算和 Plot 声明。 */
import { calcHVData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'hv',
  displayName: 'HV',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_HV',
  plots: singleLinePlots(
    { id: 'hv', label: 'HV', show: 'showHV', color: (c) => c.palette.i8 },
    { min: 0, mode: 'clamp' },
  ),
  scale: { indicatorKey: 'hv', label: 'HV', decimals: 2 },
  presentation: { defaultOptions: { showHV: true } },
  runtime: {
    defaultParams: { period: 20, annualizationFactor: 252 },
    computeKey: 'calcHVData',
    compute: (data, c) => calcHVData(data, c.period, c.annualizationFactor),
  },
})
export class HVIndicatorDefinition {
  static rendererFactory = plotRenderer('hv')
}
