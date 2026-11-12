/** 公共坐标 API：真实行情插值、两端外推、槽位取整与价格轴双向一致。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit.js'

/** 三根等距 K 线，常规槽距 1000ms。 */
const EQUAL_TIMES = [1000, 2000, 3000] as const

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** 构造指定时间序列的 K 线帧上下文，只声明坐标换算关心的字段。 */
function contextFor(timestamps: readonly number[]) {
  return createMockRenderContext({
    data: timestamps.map((timestamp) => ({ timestamp, open: 1, high: 1, low: 1, close: 1 })),
  })
}

describe('公开图表坐标 API', () => {
  it.each([
    [0, -1, -1, 0],
    [1000, 0, 0, 1000],
    [1250, 0.25, 0, 1000],
    [2000, 1, 1, 2000],
    [2500, 1.5, 2, 3000],
    [3000, 2, 2, 3000],
    [4500, 3.5, 4, 5000],
    [7000, 6, 6, 7000],
  ])('时间 %s → 连续位置 %s / 槽位 %s / 槽位时间 %s', (time, index, slot, slotTime) => {
    const api = contextFor(EQUAL_TIMES).coordinates
    expect(api.timeToLogical(time)).toBe(index)
    expect(api.logicalToTime(index)).toBe(time)
    expect(api.timeToSlot(time)).toBe(slot)
    expect(api.slotToTime(slot)).toBe(slotTime)
    expect(api.timeToSlot(slotTime)).toBe(slot)
  })

  it('休市长间隔不改变常规槽距，两端都按同一节奏外推', () => {
    const start = Date.UTC(2026, 0, 5)
    const timestamps = [0, 1, 2, 3, 4, 7].map((day) => start + day * DAY)
    const api = contextFor(timestamps).coordinates
    const last = timestamps[timestamps.length - 1]!
    expect(api.timeToLogical(last + DAY)).toBe(6)
    expect(api.slotToTime(6)).toBe(last + DAY)
    expect(api.logicalToTime(-1)).toBe(start - DAY)
    expect(api.timeToSlot(start - DAY)).toBe(-1)
  })

  it('单根 K 线只有自身槽位，不凭空推算未来或过去', () => {
    const api = contextFor([1000]).coordinates
    expect(api.timeToSlot(1000)).toBe(0)
    expect(api.timeToLogical(2000)).toBeNull()
    expect(api.logicalToTime(1)).toBeNull()
    expect(api.slotToTime(-1)).toBeNull()
  })

  it.each([1, 1.25, 2])('像素比 %s 下横坐标与对数价格轴双向一致', (dpr) => {
    const api = createMockRenderContext({
      dpr,
      scrollLeft: 16,
      pane: { yAxis: { priceToY: (price) => Math.log(price), yToPrice: (y) => Math.exp(y) } },
    }).coordinates
    const x = api.logicalToX(2.5)
    expect(x).not.toBeNull()
    expect(api.xToLogical(x!)).toBeCloseTo(2.5)
    expect(api.yToPrice(api.priceToY(100)!)).toBeCloseTo(100)
  })

  it('视口外的槽位与像素互为逆运算，整槽取整只发生在吸附入口', () => {
    const api = createMockRenderContext().coordinates
    const x = api.logicalToX(120)
    expect(x).not.toBeNull()
    expect(api.xToLogical(x!)).toBeCloseTo(120)
    expect(api.xToSlot(x!)).toBe(120)
  })

  it('同一绝对时间在不同周期下都保持连续位置的双向一致', () => {
    const time = Date.UTC(2026, 0, 5, 10, 15)
    for (const minutes of [5, 60, 240]) {
      const start = Date.UTC(2026, 0, 5, 8)
      const api = contextFor(
        Array.from({ length: 100 }, (_, i) => start + i * minutes * MINUTE),
      ).coordinates
      const index = api.timeToLogical(time)
      expect(index).not.toBeNull()
      expect(api.logicalToTime(index!)).toBe(time)
    }
  })
})
