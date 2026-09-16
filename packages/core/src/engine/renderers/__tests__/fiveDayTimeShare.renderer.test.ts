/** 五日分时 renderer 的按日分段测试。 */
import { describe, expect, it } from 'vitest'
import type { TimeShareDay } from '@/data/provider/types'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createFiveDayTimeShareRendererPlugin } from '../fiveDayTimeShare'

describe('fiveDayTimeShare renderer', () => {
  it('starts independent price and average paths for every trading day', () => {
    const ctx = createMockCanvasContext()
    const data = [
      { timestamp: 1, price: 10, average: 10 },
      { timestamp: 2, price: 10.1, average: 10.05 },
      { timestamp: 3, price: 11, average: 11 },
      { timestamp: 4, price: 11.1, average: 11.05 },
    ]
    const days: TimeShareDay[] = [
      { tradingDate: '2026-08-14', preClose: 9.9, data: data.slice(0, 2) },
      { tradingDate: '2026-08-17', preClose: 10.9, data: data.slice(2) },
    ]
    createFiveDayTimeShareRendererPlugin().draw(
      createMockRenderContext({
        ctx,
        data,
        dataView: 'fiveDayTimeShare',
        period: '5daytimeshare',
        range: { start: 0, end: 4 },
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
          verticalGridLineXs: [],
        },
        pane: { height: 300, yAxis: { priceToY: (price) => 200 - price } },
        isAsiaMarket: true,
      }),
    )

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
