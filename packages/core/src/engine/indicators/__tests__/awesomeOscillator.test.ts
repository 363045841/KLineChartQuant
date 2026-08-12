/**
 * Awesome Oscillator 计算器测试。
 */

import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'

import { calcAwesomeOscillatorData } from '../calculators/awesomeOscillator'

/**
 * 创建给定中位价的合成 K 线数据。
 * @param medianPrices 中位价序列。
 * @returns 测试用 K 线数组。
 */
function createData(medianPrices: number[]): KLineData[] {
  return medianPrices.map((medianPrice, index) => ({
    timestamp: 1_700_000_000_000 + index * 60_000,
    open: medianPrice,
    high: medianPrice + 1,
    low: medianPrice - 1,
    close: medianPrice + 0.25,
  }))
}

describe('calcAwesomeOscillatorData', () => {
  it('returns equal length, slow-period warm-up, and the expected AO value', () => {
    const data = createData([2, 3, 4, 5, 6, 7, 8])
    const result = calcAwesomeOscillatorData(data, 2, 4)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, 3)).toEqual([undefined, undefined, undefined])
    expect(result.some((value) => value !== undefined)).toBe(true)
    expect(result[3]).toBeCloseTo(1, 12)
  })

  it('returns all undefined for invalid fast and slow periods', () => {
    const result = calcAwesomeOscillatorData(createData([1, 2, 3, 4]), 4, 4)

    expect(result).toEqual([undefined, undefined, undefined, undefined])
  })
})
