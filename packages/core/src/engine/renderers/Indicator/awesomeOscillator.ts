/** AO 的 Plot 和零轴声明。 */
import { calcAwesomeOscillatorData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createAwesomeOscillatorScaleLayer } from './scale/awesomeOscillator_scale.js'
@Indicator({
  name: 'awesomeOscillator',
  displayName: 'AO',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_AO',
  scaleRendererFactory: createAwesomeOscillatorScaleLayer,
  plots: {
    series: [
      {
        id: 'ao',
        label: 'AO',
        show: 'showAO',
        color: (c) => c.palette.i6,
      },
    ],
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  presentation: { defaultOptions: { showAO: true } },
  runtime: {
    defaultParams: { fast: 5, slow: 34 },
    computeKey: 'calcAwesomeOscillatorData',
    compute: (data, c) => calcAwesomeOscillatorData(data, c.fast, c.slow),
  },
})
export class AwesomeOscillatorIndicatorDefinition {
  static rendererFactory = plotRenderer('awesomeOscillator')
}
