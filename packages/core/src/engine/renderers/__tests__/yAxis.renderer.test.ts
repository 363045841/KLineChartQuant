import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createYAxisRendererPlugin, createYAxisOverlayRendererPlugin } from '@/core/renderers/yAxis'
import { createLeftYAxisStaticRendererPlugin } from '@/core/renderers/leftYAxis'
import type { RenderContext, PaneInfo, YAxisTick } from '@/plugin'

vi.mock('@/utils/kLineDraw/axis', () => ({
  drawCrosshairPriceLabel: vi.fn(),
  drawAxisPriceLabel: vi.fn(),
}))

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
      getBasePrice: () => null,
      toPercent: () => 0,
      fromPercent: () => 0,
      getDisplayPercentRange: () => ({ minPct: 0, maxPct: 0 }),
    },
    priceRange: {
      maxPrice: 120,
      minPrice: 80,
    },
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

function createCtx() {
  return {
    canvas: { width: 80, height: 200 },
    clearRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

function createContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const ctx = createCtx()

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
    yAxisRanges: [],
    xAxisRanges: [],
    period: 'daily',
    dataView: 'kline',
    getLogicalIndexAtTimestamp: () => null,
    viewport: { scrollLeft: 0, plotWidth: 600, plotHeight: 200 },
    theme: 'light',
    yAxisTicks: mockYAxisTicks,
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
    const leftAxisCtx = createCtx()
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
    const fallbackCtx = createCtx()
    const context = createContext({ ctx: fallbackCtx, yAxisCtx: undefined })

    plugin.draw(context)

    expect(fallbackCtx.clearRect).toHaveBeenCalled()
    expect(fallbackCtx.fillText).toHaveBeenCalled()
  })

  it('draws last price label via drawAxisPriceLabel for main pane when yAxisLabels contains lastPrice', () => {
    const plugin = createYAxisOverlayRendererPlugin({ axisWidth: 80, yPaddingPx: 0 })
    const context = createContext({
      pane: createPane({ id: 'main' }),
      yAxisOverlayCtx: createCtx(),
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
      yAxisOverlayCtx: createCtx(),
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
    const context = createContext({ yAxisOverlayCtx: createCtx() })

    plugin.draw(context)

    expect(drawCrosshairPriceLabel).toHaveBeenCalledTimes(0)
  })
})
