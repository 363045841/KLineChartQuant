/** BOLL 声明三条 Plot；图形、图例和范围使用同一份绘图模型。 */
import { ChartDataViewId } from '@/engine/chartModel/index.js'
import { calcBOLLData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'

@Indicator({
  name: 'boll',
  displayName: 'BOLL',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare, ChartDataViewId.FiveDayTimeShare],
  scale: { indicatorKey: 'boll', label: 'BOLL', decimals: 2 },
  getRendererName: ({ paneId }) => (paneId === 'main' ? 'boll' : `boll_${paneId}`),
  mainPane: {
    toActiveConfig: (params, active) =>
      active ? params : { ...params, showUpper: false, showMiddle: false, showLower: false },
  },
  plots: {
    series: [
      { id: 'upper', label: 'UP', field: 'upper', show: 'showUpper', color: (c) => c.boll.upper },
      {
        id: 'middle',
        label: 'MID',
        field: 'middle',
        show: 'showMiddle',
        color: (c) => c.boll.middle,
      },
      { id: 'lower', label: 'DN', field: 'lower', show: 'showLower', color: (c) => c.boll.lower },
    ],
  },
  presentation: { defaultOptions: { showUpper: true, showMiddle: true, showLower: true } },
  runtime: {
    defaultParams: { period: 20, multiplier: 2 },
    computeKey: 'calcBOLLData',
    compute: (data, c) => calcBOLLData(data, c.period, c.multiplier),
  },
})
export class BOLLDefinition {
  static rendererFactory = plotRenderer('boll', 'main')
}
