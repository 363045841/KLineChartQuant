import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createYAxisRendererPlugin } from '@/core/renderers/yAxis'
import type { RenderContext, PaneInfo } from '@/plugin'

vi.mock('@/core/renderers/Indicator/scale/indicator_scale', async () => {
  const actual = await vi.importActual<typeof import('@/core/renderers/Indicator/scale/indicator_scale')>(
    '@/core/renderers/Indicator/scale/indicator_scale',
  )
  return {
    ...actual,
    drawScaleTicks: vi.fn(),
  }
})

vi.mock('@/utils/kLineDraw/axis', () => ({
  drawCrosshairPriceLabel: vi.fn(),
  drawAxisPriceLabel: vi.fn(),
}))

import { drawScaleTicks } from '@/core/renderers/Indicator/scale/indicator_scale'
import { drawCrosshairPriceLabel, drawAxisPriceLabel } from '@/utils/kLineDraw/axis'

function createPane(overrides: Partial<PaneInfo> = {}): PaneInfo {
  return {
    id: 'main',
    role: 'price',
    capabilities: {
      showPriceAxisTicks: true,
      showCrosshairPriceLabel: true,
      candleHitTest: true,
      supportsPriceTranslate: true,
    },
    top: 0,
    height: 200,
    yAxis: {
      priceToY: (price) => price,
      yToPrice: (y) => y,
      getPaddingTop: () => 10,
      getPaddingBottom: () => 10,
      getPriceOffset: () => 2,
      getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 120, minPrice: 80 },
      getScaleType: () => 'linear',
    },
    priceRange: {
      maxPrice: 120,
      minPrice: 80,
    },
    ...overrides,
  }
}

function createContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const ctx = {} as CanvasRenderingContext2D
  Object.defineProperty(ctx, 'canvas', {
    value: { width: 80, height: 200 },
    configurable: true,
  })

  return {
    ctx,
    yAxisCtx: ctx,
    pane: createPane(),
    data: [{ close: 101 }],
    range: { start: 0, end: 0 },
    scrollLeft: 0,
    kWidth: 10,
    kGap: 2,
    dpr: 1,
    paneWidth: 600,
    kLinePositions: [],
    kLineCenters: [],
    kBarRects: [] as { x: number; width: number }[],
    yAxisLabels: [],
    xAxisLabels: [],
    theme: 'light',
    ...overrides,
  }
}

describe('yAxis renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draws ticks when pane capability showPriceAxisTicks is true', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext()

    plugin.draw(context)

    expect(drawScaleTicks).toHaveBeenCalledTimes(1)
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

    expect(drawScaleTicks).toHaveBeenCalledTimes(0)
  })

  it('uses ctx when yAxisCtx is not provided', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const fallbackCtx = {} as CanvasRenderingContext2D
    const context = createContext({ ctx: fallbackCtx, yAxisCtx: undefined })

    plugin.draw(context)

    expect(drawScaleTicks).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: fallbackCtx,
      }),
    )
  })

  it('draws last price label via drawAxisPriceLabel for main pane when yAxisLabels contains lastPrice', () => {
    const plugin = createYAxisRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext({
      pane: createPane({ id: 'main' }),
      yAxisLabels: [
        { type: 'lastPrice', y: 50, price: 101, dataIndex: 0, style: { borderColor: '#f00', bgColor: '#fff', textColor: '#000' } },
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
    const plugin = createYAxisRendererPlugin({
      axisWidth: 80,
      yPaddingPx: 0,
      getCrosshair: () => ({ y: 55, price: 95, activePaneId: 'main' }),
    })
    const context = createContext({ pane: createPane({ id: 'main' }) })

    plugin.draw(context)

    // Last price now flows through drawAxisPriceLabel; only the crosshair label uses drawCrosshairPriceLabel
    expect(drawCrosshairPriceLabel).toHaveBeenCalledTimes(1)
  })

  it('does not draw crosshair price label when getCrosshair returns null', () => {
    const plugin = createYAxisRendererPlugin({
      axisWidth: 80,
      yPaddingPx: 0,
      getCrosshair: () => null,
    })
    const context = createContext()

    plugin.draw(context)

    expect(drawCrosshairPriceLabel).toHaveBeenCalledTimes(0)
  })
})
