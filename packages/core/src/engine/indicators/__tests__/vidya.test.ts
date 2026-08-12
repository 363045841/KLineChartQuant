/**
 * VIDYA 指标计算器测试
 * 验证预热区间、CMO 自适应递推和参数校验均符合主引擎稀疏序列约定。
 */
import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'
import { calcVIDYAData } from '../calculators/vidya'

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

describe('calcVIDYAData', () => {
  it('returns an input-length sparse series after the period warm-up', () => {
    const period = 5
    const data = createData([10, 11, 12, 13, 14, 15, 16])
    const result = calcVIDYAData(data, period, 3)

    expect(result).toHaveLength(data.length)
    expect(result.slice(0, period - 1)).toEqual([undefined, undefined, undefined, undefined])
    for (let i = period - 1; i < result.length; i++) {
      expect(result[i]).toBeTypeOf('number')
    }
  })

  it('matches the hand-calculated CMO-adapted EMA on a rising sequence', () => {
    const result = calcVIDYAData(createData([1, 2, 3, 4]), 3, 2)

    // 单调上涨时 |CMO|=1，period=3 的 alpha=1/2；首个值为 3，下一值为 3.5。
    expect(result[2]).toBeCloseTo(3, 12)
    expect(result[3]).toBeCloseTo(3.5, 12)
  })

  it('returns all undefined for invalid parameters', () => {
    const data = createData([1, 2, 3, 4])

    expect(calcVIDYAData(data, 1, 2)).toEqual([undefined, undefined, undefined, undefined])
    expect(calcVIDYAData(data, 3, 0)).toEqual([undefined, undefined, undefined, undefined])
  })
})
