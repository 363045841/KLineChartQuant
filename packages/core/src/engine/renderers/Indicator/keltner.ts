/** Keltner 的三条 Plot 声明。 */
import { calcKeltnerData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'keltner',
  displayName: 'Keltner',
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
  scale: { indicatorKey: 'keltner', label: 'Keltner', decimals: 2 },
  plots: {
    series: [
      {
        id: 'upper',
        label: 'UPPER',
        field: 'upper',
        show: 'showUpper',
        color: (c) => c.palette.i8,
      },
      {
        id: 'middle',
        label: 'MID',
        field: 'middle',
        show: 'showMiddle',
        color: (c) => c.palette.i2,
      },
      {
        id: 'lower',
        label: 'LOWER',
        field: 'lower',
        show: 'showLower',
        color: (c) => c.palette.i8,
      },
    ],
  },
  presentation: { defaultOptions: { showUpper: true, showMiddle: true, showLower: true } },
  runtime: {
    defaultParams: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 },
    computeKey: 'calcKeltnerData',
    compute: (data, c) => calcKeltnerData(data, c.emaPeriod, c.atrPeriod, c.multiplier),
  },
})
export class KeltnerDefinition {
  static rendererFactory = plotRenderer('keltner', 'main')
}
