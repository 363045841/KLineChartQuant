/** KST 的双线 Plot 声明。 */
import { calcKSTData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createKstScaleLayer } from './scale/kst_scale.js'
@Indicator({
  name: 'kst',
  displayName: 'KST',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_KST',
  scaleRendererFactory: createKstScaleLayer,
  plots: {
    series: [
      { id: 'kst', label: 'KST', field: 'kst', show: 'showKST', color: (c) => c.kst.kst },
      {
        id: 'signal',
        label: 'SIGNAL',
        field: 'signal',
        show: 'showSignal',
        color: (c) => c.kst.signal,
      },
    ],
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  presentation: { defaultOptions: { showKST: true, showSignal: true } },
  runtime: {
    defaultParams: { roc1: 10, roc2: 15, roc3: 20, roc4: 30, signalPeriod: 9 },
    computeKey: 'calcKSTData',
    compute: (data, c) => calcKSTData(data, c.roc1, c.roc2, c.roc3, c.roc4, c.signalPeriod),
  },
})
export class KSTIndicatorDefinition {
  static rendererFactory = plotRenderer('kst')
}
