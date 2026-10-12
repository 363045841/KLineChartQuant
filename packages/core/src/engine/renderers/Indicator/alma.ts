/** ALMA 指标声明：计算结果投影为一条 Plot。 */
import { calcALMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'

@Indicator({
  name: 'alma',
  displayName: 'ALMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showALMA: active }) },
  plots: singleLinePlots({
    id: 'alma',
    label: 'ALMA',
    show: 'showALMA',
    color: (c) => c.palette.i3,
  }),
  scale: { indicatorKey: 'alma', label: 'ALMA', decimals: 2 },
  presentation: { defaultOptions: { showALMA: true } },
  runtime: {
    defaultParams: { period: 9, offset: 0.85, sigma: 6 },
    computeKey: 'calcALMAData',
    compute: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  },
})
export class ALMADefinition {
  static rendererFactory = plotRenderer('alma', 'main')
}
