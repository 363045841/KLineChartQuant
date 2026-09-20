import { describe, expect, it } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockPaneInfoOverrides,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'

import type { RenderContext } from '../../../foundation/plugin/index'
import type { KLineData } from '../../../foundation/types/price'
import {
  buildComparisonLinePoints,
  createComparisonLineRenderer,
  strokeStrip,
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

/** 比较折线只消费 pane.id 与 yAxis.priceToY，其余走共享默认值。 */
function makePane(): MockPaneInfoOverrides {
  return {
    yAxis: { priceToY: (price) => price },
  }
}

function makeContext(overrides: MockRenderContextOverrides = {}): RenderContext {
  return createMockRenderContext({
    ctx: createMockCanvasContext(),
    pane: makePane(),
    data: mainData,
    dataView: 'comparison',
    comparisonData: new Map([[CMP_IDENTITY, cmpData]]),
    comparisonSymbols: [{ symbol: 'CMP', market: 'CN', period: 'daily' }],
    comparisonColors: new Map(),
    range: { start: 0, end: 3 },
    kWidth: 10,
    kGap: 2,
    paneWidth: 300,
    kLinePositions: [0, 10, 20],
    kLineCenters: [0, 10, 20],
    kBarRects: [
      { x: 0, width: 9 },
      { x: 10, width: 9 },
      { x: 20, width: 9 },
    ],
    ...overrides,
  })
}

describe('buildComparisonLinePoints', () => {
  it('converts comparison percent change to main-base equivalent price', () => {
    const byDate = new Map(cmpData.map((d) => [d.date!, d]))
    const points = buildComparisonLinePoints(makeContext(), mainData, byDate, 50, 100, 0)
    expect(points).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 102 },
      { x: 20, y: 104 },
    ])
  })

  it('starts the line at the baseline index, skipping bars left of it', () => {
    const byDate = new Map(cmpData.map((d) => [d.date!, d]))
    const points = buildComparisonLinePoints(makeContext(), mainData, byDate, 51, 102, 1)
    expect(points).toEqual([
      { x: 10, y: 102 },
      { x: 20, y: 104 },
    ])
  })
})

describe('createComparisonLineRenderer.draw baseline', () => {
  it('anchors the baseline on the first bar whose center is inside the content area', () => {
    const ctx = createMockCanvasContext()
    // 首根中心 x=-5 落在屏外 → 基准取索引 1：MAIN[1].close=102，cmp 基准 51
    createComparisonLineRenderer().draw(
      makeContext({ ctx, scrollLeft: 5, kLineCenters: [-5, 5, 15] }),
    )
    // 从基准索引 1 起画：bar1 cmp 51 → 0% → 102；bar2 cmp 52 → +1/51 → 104
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 102)
    expect(ctx.lineTo).toHaveBeenCalledWith(15, 104)
  })
})

describe('strokeStrip', () => {
  it('breaks the path at non-finite points', () => {
    const ctx = createMockCanvasContext()
    strokeStrip(
      ctx,
      [
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      '#000',
    )
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    // 断点两侧各一段：第一段 1 点，第二段 2 点（2 moveTo + 1 lineTo）
    expect(ctx.lineTo).toHaveBeenCalledTimes(1)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('does nothing with fewer than two points', () => {
    const ctx = createMockCanvasContext()
    strokeStrip(ctx, [{ x: 0, y: 0 }], '#000')
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })
})

describe('createComparisonLineRenderer.draw', () => {
  it('draws one line per comparison symbol, with no privileged main line', () => {
    const ctx = createMockCanvasContext()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx }))
    expect(ctx.save).toHaveBeenCalledTimes(1)
    // 仅比较商品 1 条折线
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
  })

  it('does not draw when no comparison symbols are present', () => {
    const ctx = createMockCanvasContext()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx, comparisonSymbols: [] }))
    expect(ctx.save).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('does not draw outside comparison view', () => {
    const ctx = createMockCanvasContext()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx, dataView: 'kline' }))
    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('skips comparison symbols without loaded data', () => {
    const ctx = createMockCanvasContext()
    const renderer = createComparisonLineRenderer()
    renderer.draw(makeContext({ ctx, comparisonData: new Map() }))
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})
