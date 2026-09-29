import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLeftYAxisStaticRendererLayer } from '@/core/renderers/leftYAxis'
import {
  createYAxisOverlayRendererLayer,
  createYAxisStaticRendererLayer,
} from '@/core/renderers/yAxis'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockPaneInfoOverrides,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext, YAxisTick } from '@/plugin'

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
    const layer = createYAxisStaticRendererLayer({ axisWidth: 80 })
    const context = createContext()

    layer.paint(context)

    const targetCtx = context.yAxisCtx!
    expect(targetCtx.clearRect).toHaveBeenCalled()
    expect(targetCtx.fillText).toHaveBeenCalled()
  })

  it('does not draw ticks when pane capability showPriceAxisTicks is false', () => {
    const layer = createYAxisStaticRendererLayer({ axisWidth: 80 })
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

    layer.paint(context)

    const targetCtx = context.yAxisCtx!
    expect(targetCtx.fillText).toHaveBeenCalledTimes(0)
  })

  it('uses the percent scale for timeshare left-axis ticks', () => {
    const layer = createLeftYAxisStaticRendererLayer({ axisWidth: 80 })
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

    layer.paint(context)

    expect(leftAxisCtx.fillText).toHaveBeenCalledWith('+20.00%', expect.any(Number), 10)
  })

  it('uses price values for timeshare right-axis ticks', () => {
    const layer = createYAxisStaticRendererLayer({ axisWidth: 80 })
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

    layer.paint(context)

    expect(context.yAxisCtx?.fillText).toHaveBeenCalledWith('120.00', expect.any(Number), 10)
  })

  it('uses ctx when yAxisCtx is not provided', () => {
    const layer = createYAxisStaticRendererLayer({ axisWidth: 80 })
    const fallbackCtx = createMockCanvasContext()
    const context = createContext({ ctx: fallbackCtx, yAxisCtx: undefined })

    layer.paint(context)

    expect(fallbackCtx.clearRect).toHaveBeenCalled()
    expect(fallbackCtx.fillText).toHaveBeenCalled()
  })

  it('paints registered decoration labels on the right overlay canvas', () => {
    const layer = createYAxisOverlayRendererLayer({ axisWidth: 80 })
    const context = createContext({
      pane: createPane({ id: 'main' }),
      yAxisOverlayCtx: createMockCanvasContext(),
    })
    context.axisLabels.forSurface('yRightOverlay', 'main').register({
      kind: 'tag',
      text: '101.00',
      pos: 50,
      bgColor: '#fff',
      borderColor: '#f00',
      textColor: '#000',
    })

    layer.paint(context)

    // label 变体文本下移 1px：round(50) + 1 = 51
    expect(context.yAxisOverlayCtx?.fillText).toHaveBeenCalledWith('101.00', expect.any(Number), 51)
  })

  it('registers and paints the crosshair price tag for the active pane', () => {
    const layer = createYAxisOverlayRendererLayer({
      axisWidth: 80,
      getCrosshair: () => ({ y: 55, price: 95, activePaneId: 'main' }),
    })
    const context = createContext({
      pane: createPane({ id: 'main' }),
      yAxisOverlayCtx: createMockCanvasContext(),
    })

    layer.paint(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
      expect.objectContaining({ kind: 'tag', text: '95.00', variant: 'crosshair' }),
    ])
    expect(context.yAxisOverlayCtx?.fillText).toHaveBeenCalled()
  })

  it('does not draw a crosshair tag when getCrosshair returns null', () => {
    const layer = createYAxisOverlayRendererLayer({
      axisWidth: 80,
      getCrosshair: () => null,
    })
    const context = createContext({ yAxisOverlayCtx: createMockCanvasContext() })

    layer.paint(context)

    expect(context.yAxisOverlayCtx?.fillText).toHaveBeenCalledTimes(0)
  })
})
