/** SAR 的散点 Plot 声明。 */
import { calcSARData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import { readPlotField } from '@/engine/plots/impl/projectPlots.js'
@Indicator({
  name: 'sar',
  displayName: 'SAR',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'trend',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showSAR: active }) },
  scale: { indicatorKey: 'sar', label: 'SAR', decimals: 4 },
  plots: {
    series: [
      {
        id: 'sar',
        label: 'SAR',
        kind: 'points',
        field: 'value',
        show: 'showSAR',
        color: (c) => c.candleUpBody,
        pointColor: (_value, _previous, c, raw) =>
          readPlotField(raw, 'trend') === 'up' ? c.candleUpBody : c.candleDownBody,
      },
    ],
  },
  presentation: { defaultOptions: { showSAR: true } },
  runtime: {
    defaultParams: { step: 0.02, maxStep: 0.2 },
    computeKey: 'calcSARData',
    compute: (data, c) => calcSARData(data, c.step, c.maxStep),
  },
})
export class SARDefinition {
  static rendererFactory = plotRenderer('sar')
}
