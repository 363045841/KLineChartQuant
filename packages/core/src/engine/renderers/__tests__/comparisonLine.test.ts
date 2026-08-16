import { describe, it, expect, vi } from 'vitest'

import type { RenderContext } from '../../../foundation/plugin/index'
import type { KLineData } from '../../../foundation/types/price'
import {
  buildMainLinePoints,
  buildComparisonLinePoints,
  strokeStrip,
  createComparisonLineRenderer,
} from '../comparisonLine'

const mainData: KLineData[] = [
  { timestamp: 1, date: '2026-01-01', open: 100, high: 101, low: 99, close: 100 },
  { timestamp: 2, date: '2026-01-02', open: 100, high: 102, low: 100, close: 102 },
  { timestamp: 3, date: '2026-01-03', open: 102, high: 103, low: 101, close: 101 },
]

const cmpData: KLineData[] = [
  { timestamp: 1, date: '2026-01-01', open: 50, high: 51, low: 49, close: 50 },
  { timestamp: 2, date: '2026-01-02', open: 50, high: 51, low: 50, close: 51 },
  { timestamp: 3, date: '2026-01-03', open: 51, high: 52, low: 50, close: 52 },
]

/** symbolSpecIdentityKey({ symbol:'CMP', market:'CN', period:'daily' }) */
const CMP_IDENTITY = '["","CN","","CMP",[]]'

function makePane(priceToY = (p: number) => p) {
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
    height: 100,
    yAxis: {
      priceToY,
      yToPrice: () => 0,
      getPaddingTop: () => 0,
      getPaddingBottom: () => 0,
      getPriceOffset: () => 0,
      getDisplayRange: () => ({ maxPrice: 110, minPrice: 90 }),
      getScaleType: () => 'percent' as const,
      getBasePrice: () => 100,
      toPercent: (p: number) => p - 100,
      fromPercent: (p: number) => 100 + p,
      getDisplayPercentRange: () => ({ minPct: -10, maxPct: 10 }),
    },
    priceRange: { maxPrice: 110, minPrice: 90 },
  }
}

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    ctx: {} as CanvasRenderingContext2D,
    pane: makePane(),
    data: mainData,
    period: 'daily',
    dataView: 'comparison',
    comparisonData: new Map([[CMP_IDENTITY, cmpData]]),
    comparisonSymbols: [{ symbol: 'CMP', market: 'CN', period: 'daily' }],
    comparisonColors: new Map(),
    range: { start: 0, end: 3 },
    scrollLeft: 0,
    kWidth: 10,
    kGap: 2,
    dpr: 1,
    paneWidth: 300,
    kLinePositions: [0, 10, 20],
    kLineCenters: [0, 10, 20],
    kBarRects: [
      { x: 0, width: 9 },
      { x: 10, width: 9 },
      { x: 20, width: 9 },
    ],
    theme: 'light',
    ...overrides,
  } as unknown as RenderContext
}

function mockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

describe('buildMainLinePoints', () => {
  it('maps each close through priceToY on main data', () => {
    const points = buildMainLinePoints(makeContext(), mainData)
    expect(points).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 102 },
      { x: 20, y: 101 },
    ])
  })

  it('marks missing bars with NaN y so the path breaks', () => {
    const broken = [mainData[0]!, { ...mainData[1]!, close: Number.NaN }, mainData[2]!]
    const points = buildMainLinePoints(makeContext(), broken)
    expect(points[1]!.y).toBeNaN()
  })
})

describe('buildComparisonLinePoints', () => {
  it('converts comparison percent change to main-base equivalent price', () => {
    const byDate = new Map(cmpData.map((d) => [d.date!, d]))
    const points = buildComparisonLinePoints(makeContext(), mainData, byDate, 50, 100)
    expect(points).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 102 },
      { x: 20, y: 104 },
    ])
  })
})

describe('strokeStrip', () => {
  it('breaks the path at non-finite points', () => {
    const ctx = mockCtx()
    strokeStrip(ctx, [
      { x: 0, y: 0 },
      { x: 1, y: Number.NaN },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ], '#000')
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    // 断点两侧各一段：第一段 1 点，第二段 2 点（2 moveTo + 1 lineTo）
    expect(ctx.lineTo).toHaveBeenCalledTimes(1)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('does nothing with fewer than two points', () => {
    const ctx = mockCtx()
    strokeStrip(ctx, [{ x: 0, y: 0 }], '#000')
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })
})

describe('createComparisonLineRenderer.draw', () => {
  it('draws the main symbol line plus comparison lines in comparison view', () => {
    const ctx = mockCtx()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx }))
    expect(ctx.save).toHaveBeenCalledTimes(1)
    // 主商品 1 条 + 比较商品 1 条
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).toHaveBeenCalledTimes(4)
  })

  it('does not draw when no comparison symbols are present', () => {
    const ctx = mockCtx()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx, comparisonSymbols: [] }))
    expect(ctx.save).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('does not draw outside comparison view', () => {
    const ctx = mockCtx()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx, dataView: 'kline' }))
    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('skips comparison symbols without loaded data', () => {
    const ctx = mockCtx()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx, comparisonData: new Map() }))
    // 比较商品无数据仍画主商品折线
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })
})
