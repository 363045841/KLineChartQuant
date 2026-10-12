/** MFI 的 Plot 和参考线声明。 */
import { calcMFIData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'mfi',
  displayName: 'MFI',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_MFI',
  scale: { indicatorKey: 'mfi', label: 'MFI', decimals: 2 },
  plots: {
    series: [{ id: 'mfi', label: 'MFI', show: 'showMFI', color: (c) => c.palette.i5 }],
    range: { min: 0, max: 100 },
    guides: [
      { value: 80, color: (c) => c.cci.overbought },
      { value: 20, color: (c) => c.cci.oversold },
    ],
  },
  presentation: { defaultOptions: { showMFI: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcMFIData',
    compute: (data, c) => calcMFIData(data, c.period),
  },
})
export class MFIIndicatorDefinition {
  static rendererFactory = plotRenderer('mfi', 'sub_MFI')
}
