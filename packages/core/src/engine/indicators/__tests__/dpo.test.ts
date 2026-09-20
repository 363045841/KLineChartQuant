/**
 * DPO 计算器测试。
 */

import { describe, expect, it } from 'vitest'

import { calcDPOData } from '../calculators/dpo'
import { fromCloses } from './__fixtures__/synthetic'

describe('calcDPOData', () => {
  it('returns equal length, warm-up undefined, and the expected DPO value', () => {
    const data = fromCloses([10, 11, 12, 13, 14, 15, 16, 17], { spread: 1 })
    const result = calcDPOData(data, 4)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, 3)).toEqual([undefined, undefined, undefined])
    expect(result.some((value) => value !== undefined)).toBe(true)
    expect(result[3]).toBeCloseTo(-1.5, 12)
  })

  it('returns all undefined for an invalid period', () => {
    const result = calcDPOData(fromCloses([10, 11, 12, 13, 14], { spread: 1 }), 1)

    expect(result).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
})
