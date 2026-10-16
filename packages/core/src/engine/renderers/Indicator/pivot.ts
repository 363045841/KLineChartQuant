/** Pivot 的七条 Plot 声明。 */
import { calcPivotData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'pivot',
  displayName: 'Pivot',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'support-resistance',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    toActiveConfig: (params, active) => ({
      ...params,
      showPP: active,
      showR1: active,
      showR2: active,
      showR3: active,
      showS1: active,
      showS2: active,
      showS3: active,
    }),
  },
  scale: { indicatorKey: 'pivot', label: 'Pivot', decimals: 2 },
  plots: {
    series: [
      { id: 'pp', label: 'PP', field: 'pp', show: 'showPP', color: (c) => c.palette.i10 },
      { id: 'r1', label: 'R1', field: 'r1', show: 'showR1', color: (c) => c.pivot.resistance },
      { id: 'r2', label: 'R2', field: 'r2', show: 'showR2', color: (c) => c.pivot.resistance },
      { id: 'r3', label: 'R3', field: 'r3', show: 'showR3', color: (c) => c.pivot.resistance },
      { id: 's1', label: 'S1', field: 's1', show: 'showS1', color: (c) => c.palette.i3 },
      { id: 's2', label: 'S2', field: 's2', show: 'showS2', color: (c) => c.palette.i3 },
      { id: 's3', label: 'S3', field: 's3', show: 'showS3', color: (c) => c.palette.i3 },
    ],
  },
  presentation: {
    defaultOptions: {
      showPP: true,
      showR1: true,
      showR2: true,
      showR3: true,
      showS1: true,
      showS2: true,
      showS3: true,
    },
  },
  runtime: {
    defaultParams: {},
    computeKey: 'calcPivotData',
    compute: (data) => calcPivotData(data),
  },
})
export class PivotDefinition {
  static rendererFactory = plotRenderer('pivot')
}
