/** 分时模式的可见价格范围、均价覆盖与昨收基准测试。 */
import { describe, expect, it } from 'vitest'
import { createTimeSharePoint } from '@/engine/__tests__/helpers/timeShareTestKit'
import type { TimeShareData } from '@/foundation/types/price'
import { createMockChartDataManager } from '../../../../data/__tests__/helpers/chartDataManagerTestKit'
import { TimeShareMode } from '../timeShareMode'

/** 构造分时点，默认均价与价格相同。 */
function ts(price: number, i = 0, average = price): TimeShareData {
  return createTimeSharePoint({ timestamp: i, price, average, volume: 1, amount: price })
}

/** 用已有数据管理器替身提供分时行情与昨收。 */
function mockDm(points: TimeShareData[], preClose: number | null = null) {
  return createMockChartDataManager({
    currentPeriod: 'timeshare',
    timeShareData: points,
    preClose,
  })
}

describe('TimeShareMode', () => {
  it('把可见价格与均价拟合成百分比轴高度对应的范围', () => {
    const mode = new TimeShareMode()
    const points: TimeShareData[] = [
      { timestamp: 0, price: 220, average: 220, amount: 1000 },
      { timestamp: 1, price: 230.7, average: 230.7, amount: 2000 },
      { timestamp: 2, price: 230.82, average: 230.75, amount: 3000 },
    ]

    const result = mode.computePaneRange({ start: 1, end: 3 }, mockDm(points, 230))

    expect(result?.basePrice).toBe(230)
    expect(result?.range.minPrice).toBeCloseTo(229.918, 8)
    expect(result?.range.maxPrice).toBeCloseTo(230.902, 8)
  })

  it.each([
    [11, 10.5, 10.2],
    [9, 9.5, 9.8],
  ])('行情全部位于昨收同侧时，0%% 基准仍在自动范围内（%s/%s/%s）', (a, b, c) => {
    const mode = new TimeShareMode()
    const result = mode.computePaneRange({ start: 0, end: 3 }, mockDm([ts(a), ts(b), ts(c)], 10))

    expect(result?.basePrice).toBe(10)
    expect(result!.range.minPrice).toBeLessThan(Math.min(10, a, b, c))
    expect(result!.range.maxPrice).toBeGreaterThan(Math.max(10, a, b, c))
  })

  it('平盘日仍给出非零范围', () => {
    const mode = new TimeShareMode()
    const result = mode.computePaneRange({ start: 0, end: 2 }, mockDm([ts(10), ts(10)], 10))

    expect(result?.range.maxPrice).toBeCloseTo(10.001, 6)
    expect(result?.range.minPrice).toBeCloseTo(9.999, 6)
  })

  // 验证黄色均线超出价格线范围时仍包含在分时 Y 轴内。
  it('把均价一起纳入 Y 轴范围', () => {
    const mode = new TimeShareMode()
    const result = mode.computePaneRange(
      { start: 0, end: 2 },
      mockDm([ts(10, 0, 11), ts(10, 1, 11)], 10),
    )

    // 价格与均价共同决定极值，再按可见振幅留白。
    expect(result?.range.maxPrice).toBeCloseTo(11.1, 6)
    expect(result?.range.minPrice).toBeCloseTo(9.9, 6)
  })

  it('基准缺失时仍返回价格范围，只把 basePrice 置空', () => {
    const mode = new TimeShareMode()
    const result = mode.computePaneRange({ start: 0, end: 2 }, mockDm([ts(10), ts(11)], null))

    expect(result?.range.maxPrice).toBeGreaterThan(11)
    expect(result?.range.minPrice).toBeLessThan(10)
    expect(result?.basePrice).toBeNull()
  })

  it('无分时数据时返回 null', () => {
    const mode = new TimeShareMode()
    expect(mode.computePaneRange({ start: 0, end: 3 }, mockDm([]))).toBeNull()
  })
})
