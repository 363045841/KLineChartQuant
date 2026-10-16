/** DMA 的双线 Plot 声明。 */
import { calcDMAData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'dma',
  displayName: 'DMA',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'trend',
  defaultPaneId: 'sub_DMA',
  scale: { indicatorKey: 'dma', label: 'DMA', decimals: 2 },
  plots: {
    series: [
      { id: 'dif', label: 'DIF', field: 'dif', show: 'showDMA', color: (c) => c.palette.i9 },
      { id: 'ama', label: 'AMA', field: 'ama', show: 'showDMA', color: (c) => c.palette.i2 },
    ],
  },
  presentation: { defaultOptions: { showDMA: true } },
  runtime: {
    defaultParams: { p1: 10, p2: 50, p3: 10 },
    computeKey: 'calcDMAData',
    compute: (data, c) => calcDMAData(data, c.p1, c.p2, c.p3),
  },
})
export class DMADefinition {
  static rendererFactory = plotRenderer('dma')
}
