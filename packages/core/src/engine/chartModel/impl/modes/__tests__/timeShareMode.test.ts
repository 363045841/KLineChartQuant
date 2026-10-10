/** 分时模式的可见价格范围、均价覆盖与昨收基准测试。 */
import { describe, expect, it } from 'vitest'
import { FIVE_DAY_TIME_SHARE_PERIOD } from '@/controllers/types'
import type { TimeShareRange } from '@/data/provider/types'
import type { TimeShareData } from '@/foundation/types/price'
import { createMockChartDataManager } from '../../../../data/__tests__/helpers/chartDataManagerTestKit'
import { TimeShareMode } from '../timeShareMode'

/** 构造分时点，默认均价与价格相同。 */
function ts(price: number, i = 0, average = price): TimeShareData {
  return { timestamp: i, price, average, volume: 1, amount: price }
}

/** 用已有数据管理器替身提供分时行情与昨收。 */
function mockDm(
  points: TimeShareData[],
  preClose: number | null = null,
  options?: { currentPeriod?: string; timeShareRange?: TimeShareRange },
) {
  return createMockChartDataManager({
    currentPeriod: options?.currentPeriod ?? 'timeshare',
    timeShareData: points,
    preClose,
    timeShareRange: options?.timeShareRange,
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
    expect(result?.range.minPrice).toBeCloseTo(230.688, 8)
    expect(result?.range.maxPrice).toBeCloseTo(230.832, 8)
  })

  it('以 preClose 作为 basePrice，且不把不可见的昨收拉入范围', () => {
    const mode = new TimeShareMode()
    // open gap: first trade 11, preClose 10
    const result = mode.computePaneRange(
      { start: 0, end: 3 },
      mockDm([ts(11), ts(10.5), ts(10.2)], 10),
    )

    expect(result?.basePrice).toBe(10)
    // 跳空影响涨跌幅基准，不应把不可见的昨收拉入价格范围。
    expect(result?.range.maxPrice).toBeCloseTo(11.08, 6)
    expect(result?.range.minPrice).toBeCloseTo(10.12, 6)
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

  it('五日视图使用第一交易日昨收作为基准', () => {
    const mode = new TimeShareMode()
    const firstDay = [ts(10.2, 0), ts(10.4, 1)]
    const secondDay = [ts(12, 2), ts(12.2, 3)]

    const result = mode.computePaneRange(
      { start: 0, end: 4 },
      mockDm([...firstDay, ...secondDay], null, {
        currentPeriod: FIVE_DAY_TIME_SHARE_PERIOD,
        timeShareRange: {
          instrumentId: 'test',
          timezone: 'Asia/Shanghai',
          requestedDays: 2,
          olderData: 'exhausted',
          days: [
            { tradingDate: '2026-08-14', preClose: 10, data: firstDay },
            { tradingDate: '2026-08-17', preClose: 11, data: secondDay },
          ],
        },
      }),
    )

    expect(result?.basePrice).toBe(10)
  })

  it('无分时数据时返回 null', () => {
    const mode = new TimeShareMode()
    expect(mode.computePaneRange({ start: 0, end: 3 }, mockDm([]))).toBeNull()
  })
})
