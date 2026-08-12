/**
 * StochRSI 计算器测试：验证预热区、确定性 K/D 值和非法参数处理。
 */

import { describe, expect, it } from 'vitest'

import { calcStochRSIData } from '../calculators/stochRSI'

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

describe('calcStochRSIData', () => {
  it('returns an equal-length series with an undefined warm-up region', () => {
    const data = createTrendData(50)
    const result = calcStochRSIData(data, 14, 3, 3)

    expect(result).toHaveLength(data.length)
    for (let i = 0; i < 31; i++) {
      expect(result[i]).toBeUndefined()
    }
    expect(result[31]).toBeDefined()
  })

  it('returns deterministic K/D values for a continuously rising series', () => {
    const result = calcStochRSIData(createTrendData(50), 14, 3, 3)

    expect(result[31]).toEqual({ k: 50, d: 50 })
  })

  it('returns all undefined for invalid parameters', () => {
    const result = calcStochRSIData(createTrendData(20), 1, 3, 3)

    expect(result).toHaveLength(20)
    for (const point of result) {
      expect(point).toBeUndefined()
    }
  })
})
