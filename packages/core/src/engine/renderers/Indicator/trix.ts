/** TRIX 的主线和信号线 Plot 声明。 */
import { calcTRIXData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'trix',
  displayName: 'TRIX',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_TRIX',
  scale: { indicatorKey: 'trix', label: 'TRIX', decimals: 6 },
  plots: {
    series: [
      {
        id: 'trix',
        label: 'TRIX',
        seriesKey: 'series',
        show: 'showTRIX',
        color: (c) => c.palette.i4,
      },
      {
        id: 'signal',
        label: 'SIGNAL',
        seriesKey: 'signalSeries',
        show: 'showSignal',
        color: (c) => c.palette.i2,
      },
    ],
    guides: [{ value: 0, color: (c) => c.referenceLine.neutral }],
  },
  presentation: { defaultOptions: { showTRIX: true, showSignal: true } },
  runtime: {
    defaultParams: { period: 15, signalPeriod: 9 },
    computeKey: 'calcTRIXData',
    compute: (data, c) => calcTRIXData(data, c.period, c.signalPeriod),
  },
})
export class TRIXIndicatorDefinition {
  static rendererFactory = plotRenderer('trix')
}
