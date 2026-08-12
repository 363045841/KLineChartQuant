/**
 * DPO 计算器测试。
 */

import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'

import { calcDPOData } from '../calculators/dpo'

/**
 * 创建只改变收盘价的合成 K 线数据。
 * @param closes 收盘价序列。
 * @returns 测试用 K 线数组。
 */
function createData(closes: number[]): KLineData[] {
  return closes.map((close, index) => ({
    timestamp: 1_700_000_000_000 + index * 60_000,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
  }))
}

describe('calcDPOData', () => {
  it('returns equal length, warm-up undefined, and the expected DPO value', () => {
    const data = createData([10, 11, 12, 13, 14, 15, 16, 17])
    const result = calcDPOData(data, 4)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, 3)).toEqual([undefined, undefined, undefined])
    expect(result.some((value) => value !== undefined)).toBe(true)
    expect(result[3]).toBeCloseTo(-1.5, 12)
  })

  it('returns all undefined for an invalid period', () => {
    const result = calcDPOData(createData([10, 11, 12, 13, 14]), 1)

    expect(result).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
})
