/** ENE 的三条 Plot 声明。 */
import { calcENEData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'ene',
  displayName: 'ENE',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  mainPane: { toActiveConfig: (params, active) => (active ? params : null) },
  plots: {
    series: [
      { id: 'upper', label: 'UP', field: 'upper', color: (c) => c.ene.upper },
      { id: 'middle', label: 'MID', field: 'middle', color: (c) => c.ene.middle },
      { id: 'lower', label: 'DN', field: 'lower', color: (c) => c.ene.lower },
    ],
  },
  runtime: {
    defaultParams: { period: 10, deviation: 11 },
    computeKey: 'calcENEData',
    compute: (data, c) => calcENEData(data, c.period, c.deviation),
  },
})
export class ENEDefinition {
  static rendererFactory = plotRenderer('ene')
}
