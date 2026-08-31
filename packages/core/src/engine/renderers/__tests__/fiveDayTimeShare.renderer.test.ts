/** 五日分时 renderer 的按日分段测试。 */
// @ts-nocheck - Canvas mock 仅实现 renderer 使用的契约。
import { describe, expect, it, vi } from 'vitest'
import { createFiveDayTimeShareRendererPlugin } from '../fiveDayTimeShare'

/** 创建记录 stroke 路径的 Canvas mock。 */
function createMockCanvasContext() {
  let path: Array<{ x: number; y: number }> = []
  let lineDash: number[] = []
  const strokedPaths: number[][] = []
  const dashedPaths: Array<Array<{ x: number; y: number }>> = []
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => {
      path = []
    }),
    moveTo: vi.fn((x: number, y: number) => path.push({ x, y })),
    lineTo: vi.fn((x: number, y: number) => path.push({ x, y })),
    stroke: vi.fn(() => {
      strokedPaths.push(path.map((point) => point.x))
      if (lineDash.length > 0) dashedPaths.push([...path])
    }),
    fill: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    setLineDash: vi.fn((dash: number[]) => {
      lineDash = dash
    }),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    strokedPaths,
    dashedPaths,
  }
}

describe('fiveDayTimeShare renderer', () => {
  it('starts independent price and average paths for every trading day', () => {
    const ctx = createMockCanvasContext()
    const data = [
      { timestamp: 1, price: 10, average: 10 },
      { timestamp: 2, price: 10.1, average: 10.05 },
      { timestamp: 3, price: 11, average: 11 },
      { timestamp: 4, price: 11.1, average: 11.05 },
    ]
    const days = [
      { tradingDate: '2026-08-14', preClose: 9.9, data: data.slice(0, 2) },
      { tradingDate: '2026-08-17', preClose: 10.9, data: data.slice(2) },
    ]
    createFiveDayTimeShareRendererPlugin().draw({
      ctx,
      data,
      dataView: 'fiveDayTimeShare',
      period: '5daytimeshare',
      range: { start: 0, end: 4 },
      dpr: 1,
      scrollLeft: 0,
      paneWidth: 200,
      kLineCenters: [10, 20, 110, 120],
      timeShareRange: {
        instrumentId: 'test',
        timezone: 'Asia/Shanghai',
        requestedDays: 2,
        olderData: 'exhausted',
        days,
      },
      fiveDayTimeShareGeometry: {
        sessionSlots: 241,
        contentWidth: 200,
        days: [
          {
            tradingDate: '2026-08-14',
            dataStartIndex: 0,
            dataEndIndex: 2,
            startX: 0,
            endX: 100,
            labelX: 50,
          },
          {
            tradingDate: '2026-08-17',
            dataStartIndex: 2,
            dataEndIndex: 4,
            startX: 100,
            endX: 200,
            labelX: 150,
            separatorX: 100,
          },
        ],
      },
      pane: {
        height: 300,
        yAxis: { priceToY: (price: number) => 200 - price },
      },
      theme: 'light',
      isAsiaMarket: true,
    })

    const segmentPaths = ctx.strokedPaths.filter((path) => path.length === 2)
    expect(segmentPaths).toEqual(
      expect.arrayContaining([
        [10, 20],
        [110, 120],
      ]),
    )
    expect(ctx.strokedPaths.some((path) => path.includes(20) && path.includes(110))).toBe(false)
    expect(ctx.dashedPaths).toEqual([
      [
        { x: 0, y: 190.1 },
        { x: 100, y: 190.1 },
      ],
      [
        { x: 100, y: 190.1 },
        { x: 200, y: 190.1 },
      ],
    ])
  })
})
