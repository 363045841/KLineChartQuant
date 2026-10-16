/** ATR 的计算和 Plot 声明。 */
import { calcATRData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
import { createAtrScaleLayer } from './scale/atr_scale.js'
@Indicator({
  name: 'atr',
  displayName: 'ATR',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_ATR',
  scaleRendererFactory: createAtrScaleLayer,
  plots: singleLinePlots(
    { id: 'atr', label: 'ATR', show: 'showATR', color: (c) => c.palette.indicatorAtr },
    { min: 0, mode: 'clamp' },
  ),
  presentation: { defaultOptions: { showATR: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcATRData',
    compute: (data, c) => calcATRData(data, c.period),
  },
})
export class ATRIndicatorDefinition {
  static rendererFactory = plotRenderer('atr')
}
