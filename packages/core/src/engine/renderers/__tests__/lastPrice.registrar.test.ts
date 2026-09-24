/** 验证最新价标签经轴标签模块注册到右轴 overlay 表面。 */
import { describe, expect, it, vi } from 'vitest'
import {
  createLastPriceLabelRegistrarPlugin,
  createLastPriceLineRendererPlugin,
} from '@/core/renderers/lastPrice'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { resolveThemeColors } from '@/foundation/tokens/index'
import { ChartDataViewId } from '@/foundation/types/chartView'

describe('createLastPriceLabelRegistrarPlugin', () => {
  it('registers the last price label on the right overlay surface', () => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 90, high: 95, low: 88, close: 90 },
        { timestamp: 2_000, open: 90, high: 96, low: 89, close: 95 },
      ],
    })

    createLastPriceLabelRegistrarPlugin().draw(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
      expect.objectContaining({ kind: 'tag', type: 'lastPrice', text: '95.00' }),
    ])
  })

  it('registers the remaining time for a live supported bar', () => {
    const now = 1_700_000_000_000
    vi.setSystemTime(now)
    try {
      const context = createMockRenderContext({
        dataView: ChartDataViewId.KLine,
        period: '5min',
        data: [{ timestamp: now, open: 90, high: 96, low: 89, close: 95 }],
      })

      createLastPriceLabelRegistrarPlugin().draw(context)

      expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
        expect.objectContaining({ type: 'lastPrice', countdown: '05:00' }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not register when the last close is outside the display range', () => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 190, high: 195, low: 188, close: 190 },
        { timestamp: 2_000, open: 190, high: 196, low: 189, close: 195 },
      ],
      pane: { yAxis: { getDisplayRange: () => ({ minPrice: 0, maxPrice: 100 }) } },
    })

    createLastPriceLabelRegistrarPlugin().draw(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([])
  })
})

describe('createLastPriceLineRendererPlugin', () => {
  it.each([
    { close: 105, direction: 'up' },
    { close: 95, direction: 'down' },
  ])('uses the $direction label border color for the latest price line', ({ close, direction }) => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 100, high: 110, low: 90, close: 100 },
        { timestamp: 2_000, open: 100, high: 110, low: 90, close },
      ],
      pane: { yAxis: { getDisplayRange: () => ({ minPrice: 90, maxPrice: 110 }) } },
      overlayCtx: createMockCanvasContext(),
    })

    createLastPriceLabelRegistrarPlugin().draw(context)
    createLastPriceLineRendererPlugin().draw(context)

    const label = context.axisLabels.forSurface('yRightOverlay', 'main').labels[0]
    const colors = resolveThemeColors(
      context.theme,
      context.isAsiaMarket,
      context.colorPresetSettings,
    )
    const expectedColor = direction === 'up' ? colors.candleUpBorder : colors.candleDownBorder
    expect(label?.kind === 'tag' ? label.borderColor : undefined).toBe(expectedColor)
    expect(context.overlayCtx?.strokeStyle).toBe(expectedColor)
    expect(context.overlayCtx?.stroke).toHaveBeenCalled()
  })
})
