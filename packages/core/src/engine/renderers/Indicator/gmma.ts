/** GMMA 的十二条 Plot 声明。 */
import { calcGMMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'gmma',
  displayName: 'GMMA',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: { toActiveConfig: (params, active) => ({ ...params, showGMMA: active }) },
  scale: { indicatorKey: 'gmma', label: 'GMMA', decimals: 2 },
  plots: {
    series: [
      { id: 'g3', label: 'G3', seriesKey: '3', show: 'showGMMA', color: (c) => c.palette.i2 },
      { id: 'g5', label: 'G5', seriesKey: '5', show: 'showGMMA', color: (c) => c.palette.i5 },
      { id: 'g8', label: 'G8', seriesKey: '8', show: 'showGMMA', color: (c) => c.gmma.g8 },
      { id: 'g10', label: 'G10', seriesKey: '10', show: 'showGMMA', color: (c) => c.gmma.g10 },
      { id: 'g12', label: 'G12', seriesKey: '12', show: 'showGMMA', color: (c) => c.palette.i4 },
      { id: 'g15', label: 'G15', seriesKey: '15', show: 'showGMMA', color: (c) => c.palette.i8 },
      { id: 'l30', label: 'L30', seriesKey: '30', show: 'showGMMA', color: (c) => c.palette.i6 },
      { id: 'l35', label: 'L35', seriesKey: '35', show: 'showGMMA', color: (c) => c.palette.i6 },
      { id: 'l40', label: 'L40', seriesKey: '40', show: 'showGMMA', color: (c) => c.palette.i9 },
      { id: 'l45', label: 'L45', seriesKey: '45', show: 'showGMMA', color: (c) => c.palette.i9 },
      { id: 'l50', label: 'L50', seriesKey: '50', show: 'showGMMA', color: (c) => c.gmma.g50 },
      { id: 'l60', label: 'L60', seriesKey: '60', show: 'showGMMA', color: (c) => c.gmma.g60 },
    ],
  },
  presentation: { defaultOptions: { showGMMA: true } },
  runtime: { defaultParams: {}, computeKey: 'calcGMMAData', compute: (data) => calcGMMAData(data) },
})
export class GMMADefinition {
  static rendererFactory = plotRenderer('gmma')
}
