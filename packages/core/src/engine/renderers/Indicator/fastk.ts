/** FASTK 的 Plot 和参考线声明。 */
import { calcFASTKData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createFastkScaleLayer } from './scale/fastk_scale.js'
@Indicator({
  name: 'fastk',
  displayName: 'FASTK',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_FASTK',
  scaleRendererFactory: createFastkScaleLayer,
  plots: {
    series: [{ id: 'fastk', label: 'FASTK', show: 'showFASTK', color: (c) => c.kdj.k }],
    range: { min: 0, max: 100 },
    guides: [80, 50, 20].map((value) => ({ value, color: (c) => c.kdj.guide })),
  },
  presentation: { defaultOptions: { showFASTK: true } },
  runtime: {
    defaultParams: { period: 9 },
    computeKey: 'calcFASTKData',
    compute: (data, c) => calcFASTKData(data, c.period),
  },
})
export class FASTKIndicatorDefinition {
  static rendererFactory = plotRenderer('fastk', 'sub_FASTK')
}
