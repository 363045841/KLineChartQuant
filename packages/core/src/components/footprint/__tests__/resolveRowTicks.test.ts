/** 验证自动行高的统计窗口、跳空口径和最小价格精度。 */
import { describe, expect, it } from 'vitest'
import type { KLineData } from '@/foundation/types/price.js'
import { resolveRowTicks } from '../impl/resolveRowTicks.js'
import { FOOTPRINT_DEFAULT_PARAMS, FOOTPRINT_ROW_MODES } from '../types.js'

/** 将振幅列表转为连续柱，默认最后一根为尚未收盘柱。 */
function bars(ranges: number[]): KLineData[] {
  return ranges.map((range, index) => ({
    timestamp: index * 1000,
    open: 100,
    high: 100 + range,
    low: 100,
    close: 100,
  }))
}

describe('Footprint row ticks', () => {
  it('uses only the most recent completed candles in the selected window', () => {
    expect(
      resolveRowTicks(bars([300, 15, 45, 900]), { ...FOOTPRINT_DEFAULT_PARAMS, rowPeriod: 2 }, 1),
    ).toBe(2)
  })

  it.each([10, 15, 20])('targets %i rows and rounds to whole ticks', (targetRows) => {
    expect(resolveRowTicks(bars([30, 900]), { ...FOOTPRINT_DEFAULT_PARAMS, targetRows }, 0.1)).toBe(
      Math.round(300 / targetRows),
    )
  })

  it.each([[], [900], [0, 900], [0.01, 900]].map((ranges) => ({ ranges })))(
    'uses one tick for insufficient range $ranges',
    ({ ranges }) => {
      expect(resolveRowTicks(bars(ranges), FOOTPRINT_DEFAULT_PARAMS, 1)).toBe(1)
    },
  )

  it('uses available completed candles before the full window is populated', () => {
    expect(resolveRowTicks(bars([30, 900]), FOOTPRINT_DEFAULT_PARAMS, 1)).toBe(2)
  })

  it('includes gaps in ATR and uses Wilder smoothing', () => {
    const data = bars([15, 15, 15, 900])
    data[1] = { ...data[1]!, low: 130, high: 145, close: 130 }
    data[2] = { ...data[2]!, low: 130, high: 145, close: 130 }
    const params = { ...FOOTPRINT_DEFAULT_PARAMS, rowPeriod: 2 }
    expect(resolveRowTicks(data, params, 0.1)).toBe(10)
    expect(resolveRowTicks(data, { ...params, rowMode: FOOTPRINT_ROW_MODES.ATR }, 0.1)).toBe(15)
  })
})
