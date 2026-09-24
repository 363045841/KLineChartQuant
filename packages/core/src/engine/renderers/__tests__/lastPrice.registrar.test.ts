/** 验证最新价标签注册器经轴标签收集器注册，且不依赖直接写入上下文数组。 */
import { describe, expect, it } from 'vitest'
import { createLastPriceLabelRegistrarPlugin } from '@/core/renderers/lastPrice'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createYAxisLabelCollector } from '@/engine/axisLabels/index'
import { ChartDataViewId } from '@/foundation/types/chartView'

describe('createLastPriceLabelRegistrarPlugin', () => {
  it('registers the last price label through the injected collector', () => {
    const collector = createYAxisLabelCollector()
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 90, high: 95, low: 88, close: 90 },
        { timestamp: 2_000, open: 90, high: 96, low: 89, close: 95 },
      ],
      yAxisLabelRegistrar: collector,
    })

    createLastPriceLabelRegistrarPlugin().draw(context)

    expect(collector.labels).toEqual([expect.objectContaining({ type: 'lastPrice', price: 95 })])
  })

  it('does not register when the last close is outside the display range', () => {
    const collector = createYAxisLabelCollector()
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 190, high: 195, low: 188, close: 190 },
        { timestamp: 2_000, open: 190, high: 196, low: 189, close: 195 },
      ],
      pane: { yAxis: { getDisplayRange: () => ({ minPrice: 0, maxPrice: 100 }) } },
      yAxisLabelRegistrar: collector,
    })

    createLastPriceLabelRegistrarPlugin().draw(context)

    expect(collector.labels).toEqual([])
  })
})
