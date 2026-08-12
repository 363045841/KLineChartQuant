/**
 * T3 指标计算器测试
 * 验证预热区间、递推结果和参数校验均符合主引擎稀疏序列约定。
 */
import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'
import { calcT3Data } from '../calculators/t3'

/** 将收盘价序列转换为合成 K 线数据。 */
function createData(closes: number[]): KLineData[] {
  return closes.map((close, index) => ({
    timestamp: 1_700_000_000_000 + index * 60_000,
    open: close - 0.5,
    high: close + 0.5,
    low: close - 0.5,
    close,
  }))
}

describe('calcT3Data', () => {
  it('returns an input-length sparse series after the period warm-up', () => {
    const period = 3
    const data = createData([10, 11, 12, 13, 14, 15])
    const result = calcT3Data(data, period, 0.7)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, period - 1)).toEqual([undefined, undefined])
    for (let i = period - 1; i < result.length; i++) {
      expect(result[i]).toBeTypeOf('number')
    }
  })

  it('matches the hand-calculated third EMA when volumeFactor is zero', () => {
    const result = calcT3Data(createData([1, 2, 3]), 2, 0)

    // period=2 时 alpha=2/3；第二根的三层 EMA 依次为 5/3、13/9、35/27。
    expect(result[1]).toBeCloseTo(35 / 27, 12)
  })

  it('returns all undefined for invalid parameters', () => {
    const data = createData([1, 2, 3, 4])

    expect(calcT3Data(data, 1, 0.7)).toEqual([undefined, undefined, undefined, undefined])
    expect(calcT3Data(data, 2, 1.1)).toEqual([undefined, undefined, undefined, undefined])
  })
})
