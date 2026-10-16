/** Fisher 的双线 Plot 声明。 */
import { calcFisherTransformData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createFisherTransformScaleLayer } from './scale/fisherTransform_scale.js'
@Indicator({
  name: 'fisherTransform',
  displayName: 'Fisher',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_Fisher',
  scaleRendererFactory: createFisherTransformScaleLayer,
  plots: {
    series: [
      {
        id: 'fisher',
        label: 'FISHER',
        field: 'fisher',
        show: 'showFisher',
        color: (c) => c.palette.i2,
      },
      {
        id: 'signal',
        label: 'SIGNAL',
        field: 'signal',
        show: 'showSignal',
        color: (c) => c.palette.i3,
      },
    ],
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  presentation: { defaultOptions: { showFisher: true, showSignal: true } },
  runtime: {
    defaultParams: { period: 10 },
    computeKey: 'calcFisherTransformData',
    compute: (data, c) => calcFisherTransformData(data, c.period),
  },
})
export class FisherTransformIndicatorDefinition {
  static rendererFactory = plotRenderer('fisherTransform')
}
