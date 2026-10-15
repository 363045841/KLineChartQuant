/** ROC 的计算和 Plot 声明。 */
import { calcROCData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'roc',
  displayName: 'ROC',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_ROC',
  plots: {
    series: [{ id: 'roc', label: 'ROC', show: 'showROC', color: (c) => c.palette.i6 }],
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  scale: { indicatorKey: 'roc', label: 'ROC', decimals: 2 },
  presentation: { defaultOptions: { showROC: true } },
  runtime: {
    defaultParams: { period: 12 },
    computeKey: 'calcROCData',
    compute: (data, c) => calcROCData(data, c.period),
  },
})
export class ROCIndicatorDefinition {
  static rendererFactory = plotRenderer('roc', 'sub_ROC')
}
