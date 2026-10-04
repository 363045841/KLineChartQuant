/** 分时模式的可见价格范围、均价覆盖与昨收基准测试。 */
import { describe, expect, it, vi } from 'vitest'
import { FIVE_DAY_TIME_SHARE_PERIOD } from '@/controllers/types'
import type { TimeShareRange } from '@/data/provider/types'
import type { TimeShareData } from '@/foundation/types/price'
import { ScaleType } from '@/foundation/types/scaleType'
import { createMockChartDataManager } from '../../../../data/__tests__/helpers/chartDataManagerTestKit'
import { Pane } from '../../../../layout/pane'
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
  it('fits an amount-only low-volatility series to the visible percent-axis height', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    pane.setLayout(0, 600)
    pane.yAxis.setScaleType(ScaleType.Percent)
    const points: TimeShareData[] = [
      { timestamp: 0, price: 220, average: 220, amount: 1000 },
      { timestamp: 1, price: 230.7, average: 230.7, amount: 2000 },
      { timestamp: 2, price: 230.82, average: 230.75, amount: 3000 },
    ]

    mode.updatePaneRange(pane, { start: 1, end: 3 }, mockDm(points, 230))

    expect(pane.yAxis.getBasePrice()).toBe(230)
    expect(pane.priceRange.minPrice).toBeCloseTo(230.688, 8)
    expect(pane.priceRange.maxPrice).toBeCloseTo(230.832, 8)
    const lineHeight = pane.yAxis.priceToY(230.7) - pane.yAxis.priceToY(230.82)
    expect(lineHeight / pane.height).toBeCloseTo(5 / 6, 8)
  })

  it('updatePaneRange uses preClose as basePrice and covers open gap', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    const setBase = vi.spyOn(pane.yAxis, 'setBasePrice')
    const setRange = vi.spyOn(pane.yAxis, 'setRange')

    // open gap: first trade 11, preClose 10
    mode.updatePaneRange(pane, { start: 0, end: 3 }, mockDm([ts(11), ts(10.5), ts(10.2)], 10))

    expect(setBase).toHaveBeenCalledWith(10)
    expect(setRange).toHaveBeenCalled()
    const range = setRange.mock.calls[0]![0]
    // 跳空影响涨跌幅基准，不应把不可见的昨收拉入价格范围。
    expect(range.maxPrice).toBeCloseTo(11.08, 6)
    expect(range.minPrice).toBeCloseTo(10.12, 6)
  })

  it('updatePaneRange still sets range on flat day', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    const setRange = vi.spyOn(pane.yAxis, 'setRange')

    mode.updatePaneRange(pane, { start: 0, end: 2 }, mockDm([ts(10), ts(10)], 10))
    expect(setRange).toHaveBeenCalled()
    const range = setRange.mock.calls[0]![0]
    expect(range.maxPrice).toBeCloseTo(10.001, 6)
    expect(range.minPrice).toBeCloseTo(9.999, 6)
  })

  // 验证黄色均线超出价格线范围时仍包含在分时 Y 轴内。
  it('updatePaneRange includes the average line in the Y-axis range', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    const setRange = vi.spyOn(pane.yAxis, 'setRange')

    mode.updatePaneRange(pane, { start: 0, end: 2 }, mockDm([ts(10, 0, 11), ts(10, 1, 11)], 10))

    const range = setRange.mock.calls[0]![0]
    // 价格与均价共同决定极值，再按可见振幅留白。
    expect(range.maxPrice).toBeCloseTo(11.1, 6)
    expect(range.minPrice).toBeCloseTo(9.9, 6)
  })

  it('updatePaneRange fixes the five-day axis to the first day preClose', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    const setBase = vi.spyOn(pane.yAxis, 'setBasePrice')
    const firstDay = [ts(10.2, 0), ts(10.4, 1)]
    const secondDay = [ts(12, 2), ts(12.2, 3)]

    mode.updatePaneRange(
      pane,
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

    expect(setBase).toHaveBeenCalledWith(10)
  })
})
