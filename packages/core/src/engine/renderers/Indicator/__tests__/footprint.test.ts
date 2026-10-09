/** 验证足迹图覆盖画布目标、价格行裁切和文字布局。 */
import { describe, expect, it, vi } from 'vitest'
import type { FootprintBar, FootprintRenderState } from '@/components/footprint/types.js'
import {
  createContextWithInstanceState,
  createMockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { FootprintIndicatorDefinition } from '../footprint.js'

/** 构造按固定价差排列的 Footprint 柱子，用于文本布局断言。 */
function createRowBar(rowSize: number, cellCount: number, startPrice = 100): FootprintBar {
  return {
    timestamp: 1,
    complete: true,
    delta: '0',
    total: '0',
    cells: Array.from({ length: cellCount }, (_, index) => ({
      price: String(startPrice + index * rowSize),
      bid: '1',
      ask: '1',
      bidImbalance: false,
      askImbalance: false,
    })),
  }
}

describe('Footprint Layer', () => {
  it('paints both rows and labels on the canvas above GPU candles', () => {
    const mainCtx = createMockCanvasContext()
    const overlayCtx = createMockCanvasContext()
    const state: FootprintRenderState = {
      timestamp: 1,
      series: {
        status: 'ready',
        message: null,
        rowSize: '15',
        latestTimestamp: 2,
        bars: [createRowBar(15, 2)],
      },
    }
    const layer = FootprintIndicatorDefinition.rendererFactory({ instanceId: 'fp' })
    expect(layer.role).toBe('overlay')
    layer.paint(
      createContextWithInstanceState(mainCtx, 'fp', state, {
        overlayCtx,
        range: { start: 0, end: 1 },
        kLineCenters: [200],
        kWidth: 60,
        kGap: 4,
        pane: { height: 500, yAxis: { priceToY: (price) => 500 - price } },
      }),
    )
    expect(overlayCtx.fillRect).toHaveBeenCalledTimes(4)
    expect(overlayCtx.fillText).toHaveBeenCalled()
    expect(mainCtx.fillRect).not.toHaveBeenCalled()
    expect(mainCtx.fillText).not.toHaveBeenCalled()
  })

  it('clips a price row crossing the pane boundary instead of discarding it', () => {
    const state: FootprintRenderState = {
      timestamp: 1,
      series: {
        status: 'ready',
        message: null,
        rowSize: '2',
        latestTimestamp: 2,
        bars: [
          {
            timestamp: 1,
            complete: false,
            delta: '1',
            total: '1',
            cells: [
              {
                price: '89',
                bid: '0',
                ask: '1',
                bidImbalance: false,
                askImbalance: false,
              },
            ],
          },
        ],
      },
    }
    const ctx = createMockCanvasContext()
    FootprintIndicatorDefinition.rendererFactory({ instanceId: 'fp' }).paint(
      createContextWithInstanceState(ctx, 'fp', state, {
        overlayCtx: ctx,
        range: { start: 0, end: 1 },
        kLineCenters: [100],
        kWidth: 50,
        kGap: 4,
        pane: { height: 200, yAxis: { priceToY: (price) => 1100 - price * 10 } },
      }),
    )
    expect(ctx.fillRect).toHaveBeenCalledWith(100, 190, 25, 10)
  })

  it.each([1, 1.25, 1.5, 2, 3])(
    'aligns all histogram edges after fractional scrolling at DPR=%s',
    (dpr) => {
      const state: FootprintRenderState = {
        timestamp: 1,
        series: {
          status: 'ready',
          message: null,
          rowSize: '1.37',
          latestTimestamp: 2,
          bars: [
            {
              timestamp: 1,
              complete: true,
              delta: '0',
              total: '0',
              cells: [
                {
                  price: '100.23',
                  bid: '0.000001',
                  ask: '3',
                  bidImbalance: false,
                  askImbalance: false,
                },
                {
                  price: '101.6',
                  bid: '7',
                  ask: '0',
                  bidImbalance: false,
                  askImbalance: false,
                },
              ],
            },
          ],
        },
      }
      const ctx = createMockCanvasContext()
      FootprintIndicatorDefinition.rendererFactory({ instanceId: 'fp' }).paint(
        createContextWithInstanceState(ctx, 'fp', state, {
          overlayCtx: ctx,
          dpr,
          range: { start: 0, end: 1 },
          kLineCenters: [150.73],
          scrollLeft: 40.19,
          kWidth: 53.7,
          kGap: 3.1,
          pane: { yAxis: { priceToY: (price) => 1100 - price * 10 } },
        }),
      )
      const rectangles = vi.mocked(ctx.fillRect).mock.calls
      expect(rectangles).toHaveLength(3)
      for (const [x, y, width, height] of rectangles) {
        for (const edge of [x, y, x + width, y + height]) {
          expect(edge * dpr).toBeCloseTo(Math.round(edge * dpr), 8)
        }
        expect(width * dpr).toBeGreaterThanOrEqual(1)
        expect(height * dpr).toBeGreaterThanOrEqual(1)
      }
      // 极小的非零卖量保持一个物理像素，且只向中心左侧延伸。
      expect(rectangles[0]![2] * dpr).toBeCloseTo(1, 8)
      expect(rectangles[0]![0] + rectangles[0]![2]).toBeCloseTo(rectangles[1]![0], 8)
      expect(rectangles[1]![2]).toBeLessThan(rectangles[2]![2])
    },
  )

  // 同一列行距一致时文本必须整列一致：非整数物理行距曾导致隔行丢失文本。
  it.each([
    { rowSize: 10.5, expected: 12 },
    { rowSize: 9.7, expected: 0 },
  ])('renders $expected of 12 price-row labels at rowSize $rowSize', ({ rowSize, expected }) => {
    const cellCount = 12
    const state: FootprintRenderState = {
      timestamp: 1,
      series: {
        status: 'ready',
        message: null,
        rowSize: String(rowSize),
        latestTimestamp: 2,
        bars: [createRowBar(rowSize, cellCount)],
      },
    }
    const ctx = createMockCanvasContext()
    vi.mocked(ctx.measureText).mockReturnValue({ width: 8 } as TextMetrics)
    FootprintIndicatorDefinition.rendererFactory({ instanceId: 'fp' }).paint(
      createContextWithInstanceState(ctx, 'fp', state, {
        overlayCtx: ctx,
        range: { start: 0, end: 1 },
        kLineCenters: [200],
        kWidth: 60,
        kGap: 4,
        pane: { height: 500, yAxis: { priceToY: (price) => 500 - price } },
      }),
    )
    // 柱中心 200：Bid 贴中心左侧 x=198，Ask 贴右侧 x=202。
    const calls = vi.mocked(ctx.fillText).mock.calls
    expect(calls.filter(([, x]) => x === 198)).toHaveLength(expected)
    expect(calls.filter(([, x]) => x === 202)).toHaveLength(expected)
  })
})
