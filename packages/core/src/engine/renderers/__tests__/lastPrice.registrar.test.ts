/** 验证最新价标签经轴标签模块注册到右轴 overlay 表面。 */
import { describe, expect, it } from 'vitest'
import { createLastPriceLabelLayer, createLastPriceLineLayer } from '@/core/renderers/lastPrice'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/foundation/plugin/index'
import { resolveThemeColors } from '@/foundation/tokens/index'
import { ChartDataViewId } from '@/foundation/types/chartView'

/** 以主图身份调用最新价标签 Layer.paint。 */
function paintLabel(context: RenderContext): void {
  createLastPriceLabelLayer().paint({ ...context, paneId: 'main', clear: false })
}

/** 以主图身份调用最新价线 Layer.paint。 */
function paintLine(context: RenderContext): void {
  createLastPriceLineLayer().paint({ ...context, paneId: 'main', clear: false })
}

describe('createLastPriceLabelLayer', () => {
  it('registers the last price label on the right overlay surface', () => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 90, high: 95, low: 88, close: 90 },
        { timestamp: 2_000, open: 90, high: 96, low: 89, close: 95 },
      ],
    })

    paintLabel(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
      expect.objectContaining({ kind: 'tag', type: 'lastPrice', text: '95.00' }),
    ])
  })

  it.each(['05:00', undefined])('uses the frame countdown %s without reading time', (countdown) => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      countdown,
      data: [{ timestamp: 1_000, open: 90, high: 96, low: 89, close: 95 }],
    })

    paintLabel(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
      expect.objectContaining({ type: 'lastPrice', countdown }),
    ])
  })

  it('formats the label as a percentage on the percent axis', () => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      settings: { mainRightAxisTypeSetting: 'percent' },
      pane: {
        yAxis: { toPercent: (price: number) => ((price - 100) / 100) * 100 },
      },
      data: [
        { timestamp: 1_000, open: 100, high: 110, low: 90, close: 100 },
        { timestamp: 2_000, open: 100, high: 110, low: 90, close: 105 },
      ],
    })

    paintLabel(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
      expect.objectContaining({ type: 'lastPrice', text: '+5.00%' }),
    ])
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

    paintLabel(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([])
  })
})

describe('createLastPriceLineLayer', () => {
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

    paintLabel(context)
    paintLine(context)

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
