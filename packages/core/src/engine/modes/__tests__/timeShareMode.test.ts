import { describe, expect, it, vi } from 'vitest'

import { Pane } from '../../layout/pane'
import { TimeShareMode } from '../timeShareMode'
import { FIVE_DAY_TIME_SHARE_PERIOD } from '../../../controllers/types'
import type { TimeShareRange } from '../../../data/provider/types'
import type { TimeShareData } from '../../../foundation/types/price'

function ts(price: number, i = 0, average = price): TimeShareData {
  return { timestamp: i, price, average, volume: 1, amount: price }
}

function mockDm(
  points: TimeShareData[],
  preClose: number | null = null,
  options?: { currentPeriod?: string; timeShareRange?: TimeShareRange },
) {
  return {
    currentPeriod: options?.currentPeriod ?? 'timeshare',
    getTimeShareData: () => points,
    getTimeSharePreClose: () => preClose,
    getTimeShareRange: () => options?.timeShareRange,
  } as unknown as import('../../data/chartDataManager').ChartDataManager
}

describe('TimeShareMode', () => {
  it('computeKWidth uses a fixed integer physical unit and leaves centered margins', () => {
    const mode = new TimeShareMode()
    const m = mode.computeKWidth(240, 320, 1)
    expect(m).not.toBeNull()
    expect(m!.kWidth + m!.kGap).toBe(1)
    expect((m!.kWidth + m!.kGap) * 240).toBe(240)
  })

  it('computeKWidth for partial day matches full-session bar size', () => {
    const mode = new TimeShareMode()
    const partial = mode.computeKWidth(60, 320, 1)
    const full = mode.computeKWidth(240, 320, 1)
    expect(partial).not.toBeNull()
    expect(full).not.toBeNull()
    expect(partial!.kWidth).toBeCloseTo(full!.kWidth, 8)
    expect(partial!.kGap).toBeCloseTo(full!.kGap, 8)
  })

  it('setMarketSession switches bar metrics to HK 330 slots', () => {
    const mode = new TimeShareMode()
    const ashare = mode.computeKWidth(100, 720, 1)!
    mode.setMarketSession({
      timeZone: 'Asia/Hong_Kong',
      sessions: [
        { open: 9 * 60 + 30, close: 12 * 60 },
        { open: 13 * 60, close: 16 * 60 },
      ],
      slotMinutes: 1,
    })
    const hk = mode.computeKWidth(100, 720, 1)!
    // 固定整数物理网格：A 股 240 槽 unit=3；港股 330 槽 unit=2。
    expect(ashare.kWidth + ashare.kGap).toBe(3)
    expect(hk.kWidth + hk.kGap).toBe(2)
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
    const range = setRange.mock.calls[0]![0] as { minPrice: number; maxPrice: number }
    // maxAbs 10% + 1% padding → ±11%
    expect(range.maxPrice).toBeCloseTo(11.1, 6)
    expect(range.minPrice).toBeCloseTo(8.9, 6)
  })

  it('updatePaneRange still sets range on flat day', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    const setRange = vi.spyOn(pane.yAxis, 'setRange')

    mode.updatePaneRange(pane, { start: 0, end: 2 }, mockDm([ts(10), ts(10)], 10))
    expect(setRange).toHaveBeenCalled()
    const range = setRange.mock.calls[0]![0] as { minPrice: number; maxPrice: number }
    expect(range.maxPrice).toBeCloseTo(10.05, 6)
    expect(range.minPrice).toBeCloseTo(9.95, 6)
  })

  // 验证黄色均线超出价格线范围时仍包含在分时 Y 轴内。
  it('updatePaneRange includes the average line in the Y-axis range', () => {
    const mode = new TimeShareMode()
    const pane = new Pane('main')
    const setRange = vi.spyOn(pane.yAxis, 'setRange')

    mode.updatePaneRange(pane, { start: 0, end: 2 }, mockDm([ts(10, 0, 11), ts(10, 1, 11)], 10))

    const range = setRange.mock.calls[0]![0] as { minPrice: number; maxPrice: number }
    // average=11，相对昨收 +10%，加 1% padding 后范围为 +/-11%。
    expect(range.maxPrice).toBeCloseTo(11.1, 6)
    expect(range.minPrice).toBeCloseTo(8.9, 6)
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
