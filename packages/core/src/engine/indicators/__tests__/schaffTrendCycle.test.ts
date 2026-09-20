/**
 * Schaff Trend Cycle 计算器测试：验证预热区、确定性 STC 值和非法参数处理。
 */

import { describe, expect, it } from 'vitest'
import { calcSchaffTrendCycleData } from '../calculators/schaffTrendCycle'
import { createRisingTrend } from './__fixtures__/synthetic'

describe('calcSchaffTrendCycleData', () => {
  it('returns an equal-length series with an undefined double-stochastic warm-up region', () => {
    const data = createRisingTrend(20)
    const result = calcSchaffTrendCycleData(data, 2, 3, 2, 1)

    expect(result).toHaveLength(data.length)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeDefined()
  })

  it('returns 50 when the second stochastic window has equal smoothed values', () => {
    const result = calcSchaffTrendCycleData(createRisingTrend(20), 2, 3, 2, 1)

    expect(result[2]).toBe(50)
  })

  it('returns all undefined for invalid parameters', () => {
    const result = calcSchaffTrendCycleData(createRisingTrend(20), 23, 23, 10, 0.5)

    for (const value of result) {
      expect(value).toBeUndefined()
    }
  })
})
