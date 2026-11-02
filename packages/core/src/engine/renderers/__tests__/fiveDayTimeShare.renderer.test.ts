/** 五日分时 renderer 的按日分段测试。 */
import { describe, expect, it } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import {
  createTimeShareDayGeometry,
  createTimeShareGeometry,
  createTimeShareRenderContext,
  createTimeShareSegment,
} from '@/engine/__tests__/helpers/timeShareTestKit'
import { createFiveDayTimeShareLayer } from '../fiveDayTimeShare'

describe('fiveDayTimeShare renderer', () => {
  it('starts independent price and average paths for every trading day', () => {
    const ctx = createMockCanvasContext()
    const data = [
      { timestamp: 1, price: 10, average: 10 },
      { timestamp: 2, price: 10.1, average: 10.05 },
      { timestamp: 3, price: 11, average: 11 },
      { timestamp: 4, price: 11.1, average: 11.05 },
    ]
    const context = createTimeShareRenderContext({
      ctx,
      data,
      dataView: 'fiveDayTimeShare',
      period: '5daytimeshare',
      baseline: 9.9,
      paneWidth: 200,
      centers: [10, 20, 110, 120],
      geometry: createTimeShareGeometry({
        sessionSlots: 241,
        contentWidth: 200,
        days: [
          createTimeShareDayGeometry({
            tradingDate: '2026-08-14',
            dataStartIndex: 0,
            dataEndIndex: 2,
            startX: 0,
            endX: 100,
          }),
          createTimeShareDayGeometry({
            tradingDate: '2026-08-17',
            dataStartIndex: 2,
            dataEndIndex: 4,
            startX: 100,
            endX: 200,
          }),
        ],
        segments: [
          createTimeShareSegment({ dataStartIndex: 0, dataEndIndex: 2, startX: 10, endX: 20 }),
          createTimeShareSegment({ dataStartIndex: 2, dataEndIndex: 4, startX: 110, endX: 120 }),
        ],
      }),
      pane: { height: 300, yAxis: { priceToY: (price) => 200 - price } },
    })
    createFiveDayTimeShareLayer().paint({ ...context, paneId: 'main', clear: false })

    const segmentPaths = ctx.strokedPaths
      .filter((path) => path.length === 2)
      .map((path) => path.map((point) => point.x))
    expect(segmentPaths).toEqual(
      expect.arrayContaining([
        [10, 20],
        [110, 120],
      ]),
    )
    expect(
      ctx.strokedPaths.some(
        (path) => path.some((point) => point.x === 20) && path.some((point) => point.x === 110),
      ),
    ).toBe(false)
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
