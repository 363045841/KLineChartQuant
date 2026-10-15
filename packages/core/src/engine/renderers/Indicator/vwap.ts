/** VWAP 的计算和 Plot 声明。 */
import { calcVWAPData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer, singleLinePlots } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'vwap',
  displayName: 'VWAP',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub_VWAP',
  plots: singleLinePlots({
    id: 'vwap',
    label: 'VWAP',
    show: 'showVWAP',
    color: (c) => c.palette.i4,
  }),
  scale: { indicatorKey: 'vwap', label: 'VWAP', decimals: 2 },
  presentation: { defaultOptions: { showVWAP: true } },
  runtime: {
    defaultParams: { sessionResetGapMs: 0 },
    computeKey: 'calcVWAPData',
    compute: (data, c) => calcVWAPData(data, c.sessionResetGapMs),
  },
})
export class VWAPIndicatorDefinition {
  static rendererFactory = plotRenderer('vwap', 'sub_VWAP')
}
