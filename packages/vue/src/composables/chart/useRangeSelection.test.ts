/** 区间选择收益率计算测试。 */
import { describe, expect, it } from 'vitest'

import { calculateRangeReturnRate } from './useRangeSelection'

describe('calculateRangeReturnRate', () => {
  it('按首尾收盘价计算上涨与下跌收益率', () => {
    expect(calculateRangeReturnRate(100, 112.5)).toBe(12.5)
    expect(calculateRangeReturnRate(80, 60)).toBe(-25)
  })

  it('同价区间返回零收益率', () => {
    expect(calculateRangeReturnRate(42, 42)).toBe(0)
  })

  it('拒绝零基价和非有限价格', () => {
    expect(calculateRangeReturnRate(0, 10)).toBeNull()
    expect(calculateRangeReturnRate(Number.NaN, 10)).toBeNull()
    expect(calculateRangeReturnRate(10, Number.POSITIVE_INFINITY)).toBeNull()
  })
})
