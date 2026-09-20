/**
 * FRAMA 指标计算器测试
 * 验证偶数窗口预热、分形平滑递推和参数校验均符合主引擎稀疏序列约定。
 */
import { describe, expect, it } from 'vitest'

import { calcFRAMAData } from '../calculators/frama'
import { fromCloses } from './__fixtures__/synthetic'

describe('calcFRAMAData', () => {
  it('returns an input-length sparse series after the period warm-up', () => {
    const period = 4
    const data = fromCloses([10, 11, 12, 13, 14, 15])
    const result = calcFRAMAData(data, period)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, period - 1)).toEqual([undefined, undefined, undefined])
    for (let i = period - 1; i < result.length; i++) {
      expect(result[i]).toBeTypeOf('number')
    }
  })

  it('matches the hand-calculated clamped alpha on a linear sequence', () => {
    const result = calcFRAMAData(fromCloses([1, 2, 3, 4, 5]), 4)

    // 首个就绪值以当前收盘价 4 为种子；线性窗口的 alpha 上限为 1，下一值为 5。
    expect(result[3]).toBeCloseTo(4, 12)
    expect(result[4]).toBeCloseTo(5, 12)
  })

  it('returns all undefined for odd, too-small, or non-integer periods', () => {
    const data = fromCloses([1, 2, 3, 4, 5])
    const empty = [undefined, undefined, undefined, undefined, undefined]

    expect(calcFRAMAData(data, 3)).toEqual(empty)
    expect(calcFRAMAData(data, 5)).toEqual(empty)
    expect(calcFRAMAData(data, 4.5)).toEqual(empty)
  })
})
