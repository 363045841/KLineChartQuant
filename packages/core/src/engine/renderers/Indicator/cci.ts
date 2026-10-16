/** CCI 的 Plot 和参考线声明。 */
import { calcCCIData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createCciScaleLayer } from './scale/cci_scale.js'
@Indicator({
  name: 'cci',
  displayName: 'CCI',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_CCI',
  scaleRendererFactory: createCciScaleLayer,
  plots: {
    series: [{ id: 'cci', label: 'CCI', show: 'showCCI', color: (c) => c.cci.cci }],
    range: { min: -100, max: 100, mode: 'include' },
    guides: [
      { value: 100, color: (c) => c.cci.overbought },
      { value: -100, color: (c) => c.cci.oversold },
      { value: 0, color: (c) => c.referenceLine.neutral },
    ],
  },
  presentation: { defaultOptions: { showCCI: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcCCIData',
    compute: (data, c) => calcCCIData(data, c.period),
  },
})
export class CCIIndicatorDefinition {
  static rendererFactory = plotRenderer('cci')
}
