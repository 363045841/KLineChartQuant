import { describe, it, expect, vi } from 'vitest'

import { createCandleRenderer } from '../candle'

describe('candle renderer in comparison view', () => {
  it('skips drawing candles when comparison symbols are present', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const renderer = createCandleRenderer()
    renderer.draw({
      ctx,
      comparisonSymbols: [{ symbol: 'CMP', market: 'CN', period: 'daily' }],
    } as never)
    expect(ctx.save).not.toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('still draws when no comparison symbols are present', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      setTransform: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const renderer = createCandleRenderer()
    const draw = () =>
      renderer.draw({
        ctx,
        pane: {
          id: 'main',
          role: 'price',
          capabilities: {
            showPriceAxisTicks: true,
            showCrosshairPriceLabel: true,
            candleHitTest: true,
            supportsPriceTranslate: true,
          },
          top: 0,
          height: 100,
          yAxis: {
            priceToY: () => 0,
            yToPrice: () => 0,
            getPaddingTop: () => 0,
            getPaddingBottom: () => 0,
            getPriceOffset: () => 0,
            getDisplayRange: () => ({ maxPrice: 110, minPrice: 90 }),
            getScaleType: () => 'linear' as const,
            getBasePrice: () => 100,
            toPercent: () => 0,
            fromPercent: () => 100,
            getDisplayPercentRange: () => ({ minPct: -10, maxPct: 10 }),
          },
          priceRange: { maxPrice: 110, minPrice: 90 },
        },
        data: [
          { timestamp: 1, open: 100, high: 101, low: 99, close: 100 },
          { timestamp: 2, open: 100, high: 102, low: 100, close: 102 },
        ],
        period: 'daily',
        range: { start: 0, end: 2 },
        scrollLeft: 0,
        kWidth: 10,
        kGap: 2,
        dpr: 1,
        paneWidth: 300,
        kLinePositions: [0, 10],
        kLineCenters: [5, 15],
        kBarRects: [
          { x: 0, width: 9 },
          { x: 10, width: 9 },
        ],
        theme: 'light',
      } as never)
    expect(draw).not.toThrow()
  })
})
