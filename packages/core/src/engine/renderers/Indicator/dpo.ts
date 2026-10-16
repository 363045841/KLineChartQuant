/** DPO 的 Plot 声明。 */
import { calcDPOData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
import { createDpoScaleLayer } from './scale/dpo_scale.js'
@Indicator({
  name: 'dpo',
  displayName: 'DPO',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_DPO',
  scaleRendererFactory: createDpoScaleLayer,
  plots: singleLinePlots({ id: 'dpo', label: 'DPO', show: 'showDPO', color: (c) => c.palette.i5 }),
  presentation: { defaultOptions: { showDPO: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcDPOData',
    compute: (data, c) => calcDPOData(data, c.period),
  },
})
export class DPOIndicatorDefinition {
  static rendererFactory = plotRenderer('dpo')
}
