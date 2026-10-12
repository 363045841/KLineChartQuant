/** CMF 的计算和 Plot 声明。 */
import { calcCMFData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'cmf',
  displayName: 'CMF',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_CMF',
  plots: {
    series: [{ id: 'cmf', label: 'CMF', show: 'showCMF', color: (c) => c.palette.i6 }],
    range: { min: -1, max: 1 },
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  scale: { indicatorKey: 'cmf', label: 'CMF', decimals: 4 },
  presentation: { defaultOptions: { showCMF: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcCMFData',
    compute: (data, c) => calcCMFData(data, c.period),
  },
})
export class CMFIndicatorDefinition {
  static rendererFactory = plotRenderer('cmf', 'sub_CMF')
}
