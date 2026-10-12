/** WMSR 的 Plot 和参考线声明。 */
import { calcWMSRData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createWmsrScaleLayer } from './scale/wmsr_scale.js'
@Indicator({
  name: 'wmsr',
  displayName: 'WMSR',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_WMSR',
  scaleRendererFactory: createWmsrScaleLayer,
  plots: {
    series: [{ id: 'wmsr', label: 'WMSR', show: 'showWMSR', color: (c) => c.wmsr.wmsr }],
    range: { min: -100, max: 0 },
    guides: [
      { value: -20, color: (c) => c.wmsr.overbought },
      { value: -80, color: (c) => c.wmsr.oversold },
      { value: -50, color: (c) => c.wmsr.guide },
    ],
  },
  presentation: { defaultOptions: { showWMSR: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcWMSRData',
    compute: (data, c) => calcWMSRData(data, c.period),
  },
})
export class WMSRIndicatorDefinition {
  static rendererFactory = plotRenderer('wmsr', 'sub_WMSR')
}
