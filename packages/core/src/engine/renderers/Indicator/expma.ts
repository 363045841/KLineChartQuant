/** EXPMA 的快慢两条 Plot 声明。 */
import { calcEXPMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'expma',
  displayName: 'EXPMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  mainPane: { toActiveConfig: (params, active) => (active ? params : null) },
  plots: {
    series: [
      { id: 'fast', label: 'FAST', field: 'fast', color: (c) => c.expma.fast },
      { id: 'slow', label: 'SLOW', field: 'slow', color: (c) => c.expma.slow },
    ],
  },
  runtime: {
    defaultParams: { fastPeriod: 12, slowPeriod: 50 },
    computeKey: 'calcEXPMAData',
    compute: (data, c) => calcEXPMAData(data, c.fastPeriod, c.slowPeriod),
  },
})
export class EXPMADefinition {
  static rendererFactory = plotRenderer('expma', 'main')
}
