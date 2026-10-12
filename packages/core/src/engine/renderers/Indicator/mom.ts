/** MOM 的 Plot 和零轴声明。 */
import { calcMOMData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createMomScaleLayer } from './scale/mom_scale.js'
@Indicator({
  name: 'mom',
  displayName: 'MOM',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_MOM',
  scaleRendererFactory: createMomScaleLayer,
  plots: {
    series: [{ id: 'mom', label: 'MOM', show: 'showMOM', color: (c) => c.mom.mom }],
    guides: [{ value: 0, color: (c) => c.mom.zero }],
  },
  presentation: { defaultOptions: { showMOM: true } },
  runtime: {
    defaultParams: { period: 10 },
    computeKey: 'calcMOMData',
    compute: (data, c) => calcMOMData(data, c.period),
  },
})
export class MOMIndicatorDefinition {
  static rendererFactory = plotRenderer('mom', 'sub_MOM')
}
