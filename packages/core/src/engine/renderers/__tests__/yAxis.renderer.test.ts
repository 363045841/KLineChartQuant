import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLeftYAxisStaticRendererPlugin } from '@/core/renderers/leftYAxis'
import { createYAxisOverlayRendererPlugin, createYAxisRendererPlugin } from '@/core/renderers/yAxis'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockPaneInfoOverrides,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext, YAxisTick } from '@/plugin'

vi.mock('@/utils/kLineDraw/axis', () => ({
  drawCrosshairPriceLabel: vi.fn(),
  drawAxisPriceLabel: vi.fn(),
}))

import { drawAxisPriceLabel, drawCrosshairPriceLabel } from '@/utils/kLineDraw/axis'

/** yAxis 用例的 Pane 差异：价格区间 80~120、坐标恒等映射与价格偏移。 */
function createPane(overrides: MockPaneInfoOverrides = {}): MockPaneInfoOverrides {
  return {
    height: 200,
    yAxis: {
      priceToY: (price) => price,
      yToPrice: (y) => y,
      getPaddingTop: () => 10,
      getPaddingBottom: () => 10,
      getPriceOffset: () => 2,
      getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 120, minPrice: 80 },
    },
    priceRange: { maxPrice: 120, minPrice: 80 },
    ...overrides,
  }
}

const mockYAxisTicks: YAxisTick[] = [
  { y: 10, value: 120 },
  { y: 55, value: 110 },
  { y: 100, value: 100 },
  { y: 145, value: 90 },
  { y: 190, value: 80 },
]

function createContext(overrides: MockRenderContextOverrides = {}): RenderContext {
  const ctx = createMockCanvasContext()
  return createMockRenderContext({
    ctx,
    yAxisCtx: ctx,
    pane: createPane(),
    data: [{ timestamp: 0, open: 101, high: 101, low: 101, close: 101 }],
    range: { start: 0, end: 0 },
    yAxisTicks: mockYAxisTicks,
    ...overrides,
  })
}

describe('yAxis renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draws ticks when pane capability showPriceAxisTicks is true', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext()

    plugin.draw(context)

    const targetCtx = context.yAxisCtx!
    expect(targetCtx.clearRect).toHaveBeenCalled()
    expect(targetCtx.fillText).toHaveBeenCalled()
  })

  it('does not draw ticks when pane capability showPriceAxisTicks is false', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext({
      pane: createPane({
        capabilities: {
          showPriceAxisTicks: false,
          showCrosshairPriceLabel: true,
          candleHitTest: true,
          supportsPriceTranslate: true,
        },
      }),
    })

    plugin.draw(context)

    const targetCtx = context.yAxisCtx!
    expect(targetCtx.fillText).toHaveBeenCalledTimes(0)
  })

  it('uses the percent scale for timeshare left-axis ticks', () => {
    const plugin = createLeftYAxisStaticRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const leftAxisCtx = createMockCanvasContext()
    const context = createContext({
      period: 'timeshare',
      leftAxisCtx,
      pane: createPane({
        yAxis: {
          ...createPane().yAxis,
          getScaleType: () => 'percent',
          toPercent: (price) => price - 100,
        },
      }),
    })

    plugin.draw(context)

    expect(leftAxisCtx.fillText).toHaveBeenCalledWith('+20.00%', expect.any(Number), 10)
  })

  it('uses price values for timeshare right-axis ticks', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext({
      period: 'timeshare',
      pane: createPane({
        yAxis: {
          ...createPane().yAxis,
          getScaleType: () => 'percent',
          toPercent: (price) => price - 100,
        },
      }),
    })

    plugin.draw(context)

    expect(context.yAxisCtx?.fillText).toHaveBeenCalledWith('120.00', expect.any(Number), 10)
  })

  it('uses ctx when yAxisCtx is not provided', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const fallbackCtx = createMockCanvasContext()
    const context = createContext({ ctx: fallbackCtx, yAxisCtx: undefined })

    plugin.draw(context)

    expect(fallbackCtx.clearRect).toHaveBeenCalled()
    expect(fallbackCtx.fillText).toHaveBeenCalled()
  })

  it('draws last price label via drawAxisPriceLabel for main pane when yAxisLabels contains lastPrice', () => {
    const plugin = createYAxisOverlayRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext({
      pane: createPane({ id: 'main' }),
      yAxisOverlayCtx: createMockCanvasContext(),
      yAxisLabels: [
        {
          type: 'lastPrice',
          y: 50,
          price: 101,
          style: { borderColor: '#f00', bgColor: '#fff', textColor: '#000' },
        },
      ],
    })

    plugin.draw(context)

    expect(drawAxisPriceLabel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        price: 101,
        borderColor: '#f00',
        bgColor: '#fff',
      }),
      expect.any(String),
      undefined,
      undefined,
    )
  })

  it('draws crosshair price label exactly once for active pane', () => {
    const plugin = createYAxisOverlayRendererPlugin({
      axisWidth: 80,
      yPaddingPx: 0,
      getCrosshair: () => ({ y: 55, price: 95, activePaneId: 'main' }),
    })
    const context = createContext({
      pane: createPane({ id: 'main' }),
      yAxisOverlayCtx: createMockCanvasContext(),
    })

    plugin.draw(context)

    expect(drawCrosshairPriceLabel).toHaveBeenCalledTimes(1)
  })

  it('does not draw crosshair price label when getCrosshair returns null', () => {
    const plugin = createYAxisOverlayRendererPlugin({
      axisWidth: 80,
      yPaddingPx: 0,
      getCrosshair: () => null,
    })
    const context = createContext({ yAxisOverlayCtx: createMockCanvasContext() })

    plugin.draw(context)

    expect(drawCrosshairPriceLabel).toHaveBeenCalledTimes(0)
  })
})
