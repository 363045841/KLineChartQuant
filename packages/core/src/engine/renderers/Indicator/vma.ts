/** VMA 的计算和 Plot 声明。 */
import { calcVMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'vma',
  displayName: 'VMA',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  defaultPaneId: 'sub_VMA',
  plots: singleLinePlots(
    { id: 'vma', label: 'VMA', show: 'showVMA', color: (c) => c.palette.i6 },
    { min: 0, mode: 'clamp' },
  ),
  scale: { indicatorKey: 'vma', label: 'VMA', decimals: 0 },
  presentation: { defaultOptions: { showVMA: true } },
  runtime: {
    defaultParams: { period: 5 },
    computeKey: 'calcVMAData',
    compute: (data, c) => calcVMAData(data, c.period),
  },
})
export class VMAIndicatorDefinition {
  static rendererFactory = plotRenderer('vma')
}
