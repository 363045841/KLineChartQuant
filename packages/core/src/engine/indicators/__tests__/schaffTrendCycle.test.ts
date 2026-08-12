/**
 * Schaff Trend Cycle 计算器测试：验证预热区、确定性 STC 值和非法参数处理。
 */

import { describe, expect, it } from 'vitest'

import { calcSchaffTrendCycleData } from '../calculators/schaffTrendCycle'

import type { KLineData } from '../../../foundation/types/price'

/**
 * 生成线性收盘价的测试 K 线。
 * @param length K 线数量。
 * @returns 合成 K 线数据。
 */
function createTrendData(length: number): KLineData[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + index
    return {
      timestamp: index * 60_000,
      open: close - 0.25,
      high: close + 0.5,
      low: close - 0.5,
      close,
    }
  })
}

describe('calcSchaffTrendCycleData', () => {
  it('returns an equal-length series with an undefined double-stochastic warm-up region', () => {
    const data = createTrendData(20)
    const result = calcSchaffTrendCycleData(data, 2, 3, 2, 1)

    expect(result).toHaveLength(data.length)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeDefined()
  })

  it('returns 50 when the second stochastic window has equal smoothed values', () => {
    const result = calcSchaffTrendCycleData(createTrendData(20), 2, 3, 2, 1)

    expect(result[2]).toBe(50)
  })

  it('returns all undefined for invalid parameters', () => {
    const result = calcSchaffTrendCycleData(createTrendData(20), 23, 23, 10, 0.5)

    for (const value of result) {
      expect(value).toBeUndefined()
    }
  })
})
