/**
 * Fisher Transform 计算器测试：验证预热区、确定性 Fisher 值和非法参数处理。
 */

import { describe, expect, it } from 'vitest'

import { calcFisherTransformData } from '../calculators/fisherTransform'

import type { KLineData } from '../../../foundation/types/price'

/**
 * 生成使用指定中位价的测试 K 线。
 * @param medians 中位价序列。
 * @returns 合成 K 线数据。
 */
function createMedianData(medians: number[]): KLineData[] {
  return medians.map((median, index) => ({
    timestamp: index * 60_000,
    open: median,
    high: median,
    low: median,
    close: median,
  }))
}

describe('calcFisherTransformData', () => {
  it('returns an equal-length series with undefined values before the period is ready', () => {
    const data = createMedianData([1, 2, 3, 4, 5])
    const result = calcFisherTransformData(data, 3)

    expect(result).toHaveLength(data.length)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeDefined()
  })

  it('matches the first Fisher Transform value for a two-bar rising window', () => {
    const result = calcFisherTransformData(createMedianData([1, 2]), 2)

    expect(result[1]?.fisher).toBeCloseTo(0.3428282544, 10)
    expect(result[1]?.signal).toBe(0)
  })

  it('returns all undefined for an invalid period', () => {
    const result = calcFisherTransformData(createMedianData([1, 2, 3]), 1)

    for (const point of result) {
      expect(point).toBeUndefined()
    }
  })
})
