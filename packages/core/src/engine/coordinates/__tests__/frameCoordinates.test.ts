/** 公共坐标 API 覆盖跨周期、日历、非线性价格轴及正反向的一致性。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { getFrameCoordinates } from '../impl/frameCoordinates.js'

describe('公开图表坐标 API', () => {
  it.each([
    [1000, 0, 0],
    [3500, 1.5, 2],
    [0, -1, -1],
    [7000, 2.5, 3],
    [9000, 3, 3],
  ])('时间 %s 与逻辑位置 %s 双向一致，槽位投影为 %s', (time, index, slot) => {
    const timestamps = [1000, 2000, 5000, 9000, 10000]
    const context = createMockRenderContext({
      data: timestamps
        .slice(0, 3)
        .map((timestamp) => ({ timestamp, open: 1, high: 1, low: 1, close: 1 })),
      getTimestampAtLogicalIndex: (i) => timestamps[i] ?? null,
    })
    const api = getFrameCoordinates(context)
    expect(api.timeToLogical(time)).toBe(index)
    expect(api.logicalToTime(index)).toBe(time)
    expect(api.timeToSlot(time)).toBe(slot)
  })

  it('同一时间在不同周期投影后保持原值，不要求命中 K 线开盘时间', () => {
    const time = Date.UTC(2026, 0, 5, 10, 15)
    for (const minutes of [5, 60, 240]) {
      const start = Date.UTC(2026, 0, 5, 8)
      const context = createMockRenderContext({
        data: Array.from({ length: 100 }, (_, i) => ({
          timestamp: start + i * minutes * 60000,
          open: 1,
          high: 1,
          low: 1,
          close: 1,
        })),
      })
      const api = getFrameCoordinates(context)
      const index = api.timeToLogical(time)
      expect(index).not.toBeNull()
      expect(api.logicalToTime(index!)).toBe(time)
    }
  })

  it('未知未来返回空值；日历补齐后同一绘图可直接重新定位', () => {
    const data = [{ timestamp: 1000, open: 1, high: 1, low: 1, close: 1 }]
    const unavailable = getFrameCoordinates(createMockRenderContext({ data }))
    expect(unavailable.timeToLogical(3000)).toBeNull()
    expect(unavailable.logicalToTime(2)).toBeNull()
    const available = getFrameCoordinates(
      createMockRenderContext({
        data,
        getTimestampAtLogicalIndex: (i) => [1000, 2000, 4000][i] ?? null,
      }),
    )
    expect(available.timeToLogical(3000)).toBe(1.5)
    expect(available.logicalToTime(1.5)).toBe(3000)
  })

  it.each([1, 1.25, 2])('像素比 %s 下连续横坐标和对数价格轴双向一致', (dpr) => {
    const api = getFrameCoordinates(
      createMockRenderContext({
        dpr,
        scrollLeft: 16,
        pane: { yAxis: { priceToY: (price) => Math.log(price), yToPrice: (y) => Math.exp(y) } },
      }),
    )
    const x = api.logicalToX(2.5)
    expect(x).not.toBeNull()
    expect(api.xToLogical(x!)).toBeCloseTo(2.5)
    expect(api.yToPrice(api.priceToY(100)!)).toBeCloseTo(100)
  })

  it('末根内部可以投影，缺少未来日历时不能把收盘边界当成新锚点槽位', () => {
    const start = Date.UTC(2026, 0, 5)
    const api = getFrameCoordinates(
      createMockRenderContext({
        data: [{ timestamp: start, open: 1, high: 1, low: 1, close: 1 }],
        period: '5min',
        marketSession: { timeZone: 'UTC', sessions: [{ open: 0, close: 1440 }] },
        getTimestampAtLogicalIndex: () => null,
      }),
    )
    expect(api.timeToLogical(start + 150000)).toBe(0.5)
    expect(api.logicalToTime(0.5)).toBe(start + 150000)
    expect(api.slotToTime(1)).toBeNull()
    expect(api.timeToSlot(start + 240000)).toBe(0)
  })
})
