/** UO 的 Plot 声明。 */
import { calcUltimateOscillatorData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
import { createUltimateOscillatorScaleLayer } from './scale/ultimateOscillator_scale.js'
@Indicator({
  name: 'ultimateOscillator',
  displayName: 'UO',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_UO',
  scaleRendererFactory: createUltimateOscillatorScaleLayer,
  plots: singleLinePlots({ id: 'uo', label: 'UO', show: 'showUO', color: (c) => c.palette.i7 }),
  presentation: { defaultOptions: { showUO: true } },
  runtime: {
    defaultParams: { p1: 7, p2: 14, p3: 28 },
    computeKey: 'calcUltimateOscillatorData',
    compute: (data, c) => calcUltimateOscillatorData(data, c.p1, c.p2, c.p3),
  },
})
export class UltimateOscillatorIndicatorDefinition {
  static rendererFactory = plotRenderer('ultimateOscillator')
}
