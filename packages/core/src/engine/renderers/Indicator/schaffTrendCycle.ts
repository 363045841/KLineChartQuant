/** STC 的 Plot 声明。 */
import { calcSchaffTrendCycleData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { createSchaffTrendCycleScaleLayer } from './scale/schaffTrendCycle_scale.js'
@Indicator({
  name: 'schaffTrendCycle',
  displayName: 'STC',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  defaultPaneId: 'sub_STC',
  scaleRendererFactory: createSchaffTrendCycleScaleLayer,
  plots: {
    series: [{ id: 'stc', label: 'STC', show: 'showSTC', color: (c) => c.palette.i2 }],
    guides: [25, 75].map((value) => ({ value, color: (c) => c.referenceLine.neutral })),
  },
  presentation: { defaultOptions: { showSTC: true } },
  runtime: {
    defaultParams: { fast: 23, slow: 50, cycle: 10, factor: 0.5 },
    computeKey: 'calcSchaffTrendCycleData',
    compute: (data, c) => calcSchaffTrendCycleData(data, c.fast, c.slow, c.cycle, c.factor),
  },
})
export class SchaffTrendCycleIndicatorDefinition {
  static rendererFactory = plotRenderer('schaffTrendCycle')
}
