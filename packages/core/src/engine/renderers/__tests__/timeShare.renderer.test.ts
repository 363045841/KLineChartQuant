// @ts-nocheck - Test file with intentional type relaxations for mocking
import { describe, it, expect, vi } from 'vitest'

import { createTimeShareRendererPlugin } from '../timeShare'

import type { RenderContext } from '@/plugin'
import type { TimeShareData } from '@/types/price'

function createMockCanvasContext() {
  const strokeLineWidths: number[] = []
  let lineWidth = 0

  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => {
      strokeLineWidths.push(lineWidth)
    }),
    fill: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    fillRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineJoin: '',
    lineCap: '',
    get lineWidth() {
      return lineWidth
    },
    set lineWidth(v: number) {
      lineWidth = v
    },
    strokeLineWidths,
  }

  return ctx as unknown as CanvasRenderingContext2D & { strokeLineWidths: number[] }
}

function createTsData(n = 4): TimeShareData[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    price: 10 + i * 0.1,
    average: 10 + i * 0.05,
    volume: 100 + i,
    amount: 1000 + i,
  }))
}

function createContext(ctx: CanvasRenderingContext2D, data: TimeShareData[]): RenderContext {
  const n = data.length
  return {
    ctx,
    data,
    range: { start: 0, end: n },
    dpr: 1,
    scrollLeft: 0,
    paneWidth: 800,
    period: 'timeshare',
    theme: 'light',
    isAsiaMarket: true,
    settings: { preClose: 10 },
    kLineCenters: Array.from({ length: n }, (_, i) => i * 10 + 5),
    kBarRects: Array.from({ length: n }, (_, i) => ({ x: i * 10, width: 4 })),
    pane: {
      height: 400,
      top: 0,
      yAxis: {
        priceToY: (price: number) => 200 - (price - 10) * 50,
      },
    },
  } as unknown as RenderContext
}

describe('timeShare renderer line width', () => {
  it('draws price and average lines at 1px logical width', () => {
    const ctx = createMockCanvasContext()
    const plugin = createTimeShareRendererPlugin()
    plugin.draw(createContext(ctx, createTsData()))

    // stroke 顺序：昨收虚线 → 现价折线 → 均价折线
    expect(ctx.strokeLineWidths).toEqual([1, 1, 1])
  })
})
