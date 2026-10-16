/** Fib 的区间边界和回撤线 Plot 声明。 */
import { calcFibData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'fib',
  displayName: 'Fib',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'support-resistance',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showLevels: active }) },
  scale: { indicatorKey: 'fib', label: 'Fib', decimals: 4 },
  plots: {
    series: [
      { id: 'high', label: 'HIGH', field: 'high', show: 'showLevels', color: (c) => c.palette.i10 },
      { id: 'low', label: 'LOW', field: 'low', show: 'showLevels', color: (c) => c.palette.i10 },
      {
        id: '236',
        label: '236',
        field: 'level236',
        show: 'showLevels',
        color: (c) => c.palette.i2,
      },
      {
        id: '382',
        label: '382',
        field: 'level382',
        show: 'showLevels',
        color: (c) => c.palette.i2,
      },
      {
        id: '500',
        label: '500',
        field: 'level500',
        show: 'showLevels',
        color: (c) => c.palette.i2,
      },
      { id: '618', label: '618', field: 'level618', show: 'showLevels', color: (c) => c.fib.l618 },
      { id: '786', label: '786', field: 'level786', show: 'showLevels', color: (c) => c.fib.l786 },
    ],
  },
  presentation: { defaultOptions: { showLevels: true } },
  runtime: {
    defaultParams: { period: 50 },
    computeKey: 'calcFibData',
    compute: (data, c) => calcFibData(data, c.period),
  },
})
export class FibDefinition {
  static rendererFactory = plotRenderer('fib')
}
