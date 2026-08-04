import { describe, expect, it, vi } from 'vitest'

import { Pane } from '../../layout/pane'
import { TimeShareMode } from '../timeShareMode'
import type { TimeShareData } from '../../../foundation/types/price'

function ts(price: number, i = 0, average = price): TimeShareData {
  return { timestamp: i, price, average, volume: 1, amount: price }
}

function mockDm(points: TimeShareData[], preClose: number | null = null) {
  return {
    getTimeShareData: () => points,
    getTimeSharePreClose: () => preClose,
  } as unknown as import('../../data/chartDataManager').ChartDataManager
}

describe('TimeShareMode', () => {
  it('computeKWidth fits full session into narrow view (no DPR truncation)', () => {
    const mode = new TimeShareMode()
    const m = mode.computeKWidth(240, 320, 1)
    expect(m).not.toBeNull()
    expect((m!.kWidth + m!.kGap) * 240).toBeCloseTo(320, 6)
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
    const ashare = mode.computeKWidth(100, 330, 1)!
    mode.setMarketSession({
      timeZone: 'Asia/Hong_Kong',
      sessions: [
        { open: 9 * 60 + 30, close: 12 * 60 },
        { open: 13 * 60, close: 16 * 60 },
      ],
      slotMinutes: 1,
    })
    const hk = mode.computeKWidth(100, 330, 1)!
    // A 股 240 槽 unit=330/240；港股 330 槽 unit=1
    expect(ashare.kWidth + ashare.kGap).toBeCloseTo(330 / 240, 6)
    expect(hk.kWidth + hk.kGap).toBeCloseTo(1, 6)
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
})
