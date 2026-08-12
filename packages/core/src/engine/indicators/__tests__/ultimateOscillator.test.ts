/**
 * Ultimate Oscillator 计算器测试。
 */

import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'

import { calcUltimateOscillatorData } from '../calculators/ultimateOscillator'

/**
 * 创建持续上行且波幅固定的合成 K 线数据。
 * @param count 数据条数。
 * @returns 测试用 K 线数组。
 */
function createData(count: number): KLineData[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 10 + index
    return {
      timestamp: 1_700_000_000_000 + index * 60_000,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
    }
  })
}

describe('calcUltimateOscillatorData', () => {
  it('returns equal length, longest-period warm-up, and the expected UO value', () => {
    const data = createData(7)
    const result = calcUltimateOscillatorData(data, 2, 3, 4)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, 4)).toEqual([undefined, undefined, undefined, undefined])
    expect(result.some((value) => value !== undefined)).toBe(true)
    expect(result[4]).toBeCloseTo(50, 12)
  })

  it('returns all undefined for invalid periods', () => {
    const result = calcUltimateOscillatorData(createData(6), 0, 3, 4)

    expect(result.every((value) => value === undefined)).toBe(true)
  })
})
