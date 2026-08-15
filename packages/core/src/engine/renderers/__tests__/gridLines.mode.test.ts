import { describe, expect, it, vi } from 'vitest'

import type { RenderContext } from '../../../foundation/plugin/types'
import { createGridLinesRendererPlugin } from '../gridLines'

function createMockCtx() {
  const fillRects: Array<{ x: number; y: number; width: number; height: number }> = []
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      fillRects.push({ x, y, width, height })
    }),
    canvas: { width: 800, height: 400 },
  } as unknown as CanvasRenderingContext2D & { fillRects: typeof fillRects }
  ;(ctx as any).fillRects = fillRects
  return ctx
}

// 首尾跨月（1 月 → 2 月），保证 K 线模式下会产生月份纵向分界线
const CROSS_MONTH_DATA = [
  { timestamp: new Date('2026-01-31T09:30:00+08:00').getTime() },
  { timestamp: new Date('2026-02-02T09:30:00+08:00').getTime() },
  { timestamp: new Date('2026-02-03T09:30:00+08:00').getTime() },
]

function buildContext(period: string): { ctx: ReturnType<typeof createMockCtx>; context: RenderContext } {
  const ctx = createMockCtx()
  return {
    ctx,
    context: {
      ctx,
      data: CROSS_MONTH_DATA,
      range: { start: 0, end: 3 },
      scrollLeft: 0,
      kWidth: 8,
      kGap: 2,
      dpr: 1,
      kLinePositions: [0, 10, 20],
      kLineCenters: [1, 11, 21],
      pane: { top: 0, height: 400 },
      period,
      theme: 'light',
      isAsiaMarket: true,
      colorPresetSettings: {},
    } as unknown as RenderContext,
  }
}

describe('gridLines mode', () => {
  it('draws vertical month boundary lines in kline mode', () => {
    const { ctx, context } = buildContext('daily')
    createGridLinesRendererPlugin().draw(context)
    const verticals = ctx.fillRects.filter((r) => r.width < r.height)
    expect(verticals.length).toBeGreaterThan(0)
    expect(verticals[0]?.x).toBe(1)
  })

  it('does not draw vertical month boundary lines in timeshare mode', () => {
    const { ctx, context } = buildContext('timeshare')
    createGridLinesRendererPlugin().draw(context)
    const verticals = ctx.fillRects.filter((r) => r.width < r.height)
    expect(verticals.length).toBe(0)
  })
})
