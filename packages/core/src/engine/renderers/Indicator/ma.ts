/** MA 声明五条按周期取数的 Plot。 */
import { calcMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
export const createMALayer = plotRenderer('ma', 'main')
@Indicator({
  name: 'ma',
  displayName: 'MA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  mainPane: {
    toActiveConfig: (_params, active) => ({
      ma5: active,
      ma10: active,
      ma20: active,
      ma30: active,
      ma60: active,
    }),
  },
  plots: {
    series: [
      {
        id: 'ma5',
        label: (p) => `MA${p.period1}`,
        periodParam: 'period1',
        show: 'ma5',
        color: (c) => c.ma.ma5,
      },
      {
        id: 'ma10',
        label: (p) => `MA${p.period2}`,
        periodParam: 'period2',
        show: 'ma10',
        color: (c) => c.ma.ma10,
      },
      {
        id: 'ma20',
        label: (p) => `MA${p.period3}`,
        periodParam: 'period3',
        show: 'ma20',
        color: (c) => c.ma.ma20,
      },
      {
        id: 'ma30',
        label: (p) => `MA${p.period4}`,
        periodParam: 'period4',
        show: 'ma30',
        color: (c) => c.ma.ma30,
      },
      {
        id: 'ma60',
        label: (p) => `MA${p.period5}`,
        periodParam: 'period5',
        show: 'ma60',
        color: (c) => c.ma.ma60,
      },
    ],
  },
  presentation: { defaultOptions: { ma5: true, ma10: true, ma20: true, ma30: true, ma60: true } },
  runtime: {
    defaultParams: { period1: 5, period2: 10, period3: 20, period4: 30, period5: 60 },
    computeKey: 'calcMAData',
    compute: (data, c) => {
      const result: Record<number, (number | undefined)[]> = {}
      for (const period of Object.values(c)) result[period] = calcMAData(data, period)
      return result
    },
  },
})
export class MADefinition {
  static rendererFactory = createMALayer
}
