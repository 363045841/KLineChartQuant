/** 时间坐标覆盖缺口插值、历史范围外及未来日历槽位。 */
import { describe, expect, it } from 'vitest'
import { drawingTimeIndex } from '../impl/timeCoordinate.js'

describe('drawingTimeIndex', () => {
  const data = [{ timestamp: 1000 }, { timestamp: 2000 }, { timestamp: 5000 }]
  /** 未来轴故意跨过休市间隔，禁止使用最近两根的时间差猜测。 */
  const axis = (index: number) => [1000, 2000, 5000, 9000, 10000][index] ?? null
  it.each([[1000, 0], [3500, 1.5], [0, -1], [7000, 2.5], [9000, 3]])('projects %s to %s', (time, index) => {
    expect(drawingTimeIndex(time, data, axis)).toBe(index)
  })
  it('does not invent future slots without a calendar', () => {
    expect(drawingTimeIndex(11000, data, axis)).toBeNaN()
  })
})
