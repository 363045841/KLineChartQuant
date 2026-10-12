/** Donchian 的三条 Plot 声明。 */
import { calcDonchianData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'donchian',
  displayName: 'Donchian',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    toActiveConfig: (params, active) => ({
      ...params,
      showUpper: active,
      showMiddle: active,
      showLower: active,
    }),
  },
  scale: { indicatorKey: 'donchian', label: 'Donchian', decimals: 2 },
  plots: {
    series: [
      {
        id: 'upper',
        label: 'UPPER',
        field: 'upper',
        show: 'showUpper',
        color: (c) => c.palette.i6,
      },
      {
        id: 'middle',
        label: 'MID',
        field: 'middle',
        show: 'showMiddle',
        color: (c) => c.palette.i10,
      },
      {
        id: 'lower',
        label: 'LOWER',
        field: 'lower',
        show: 'showLower',
        color: (c) => c.palette.i6,
      },
    ],
  },
  presentation: { defaultOptions: { showUpper: true, showMiddle: true, showLower: true } },
  runtime: {
    defaultParams: { period: 20 },
    computeKey: 'calcDonchianData',
    compute: (data, c) => calcDonchianData(data, c.period),
  },
})
export class DonchianDefinition {
  static rendererFactory = plotRenderer('donchian', 'main')
}
