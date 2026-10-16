/** StochRSI 的双线 Plot 声明。 */
import { calcStochRSIData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createStochRSIScaleLayer } from './scale/stochRSI_scale.js'
@Indicator({
  name: 'stochRSI',
  displayName: 'StochRSI',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_StochRSI',
  scaleRendererFactory: createStochRSIScaleLayer,
  plots: {
    series: [
      { id: 'k', label: 'K', field: 'k', show: 'showK', color: (c) => c.palette.i2 },
      { id: 'd', label: 'D', field: 'd', show: 'showD', color: (c) => c.palette.i3 },
    ],
    guides: [20, 80].map((value) => ({ value, color: (c) => c.referenceLine.neutral })),
  },
  presentation: { defaultOptions: { showK: true, showD: true } },
  runtime: {
    defaultParams: { period: 14, kPeriod: 3, dPeriod: 3 },
    computeKey: 'calcStochRSIData',
    compute: (data, c) => calcStochRSIData(data, c.period, c.kPeriod, c.dPeriod),
  },
})
export class StochRSIIndicatorDefinition {
  static rendererFactory = plotRenderer('stochRSI')
}
