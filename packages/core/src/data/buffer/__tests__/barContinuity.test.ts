/** K 线连续性：周期步长登记与末尾连续段裁剪。 */
import { describe, expect, it } from 'vitest'

import { continuousTail, periodStepMs } from '../impl/barContinuity.js'

const HOUR = 3_600_000

/** 构造一根只关心时间戳的 K 线。 */
function bar(timestamp: number) {
  return { timestamp, open: 1, high: 2, low: 0, close: 1, volume: 1 }
}

describe('K 线连续性', () => {
  it('日内周期给出固定步长，日线及以上不参与校验', () => {
    expect(periodStepMs('1min')).toBe(60_000)
    expect(periodStepMs('60min')).toBe(HOUR)
    expect(periodStepMs('4h')).toBe(4 * HOUR)
    expect(periodStepMs('daily')).toBeNull()
    expect(periodStepMs('weekly')).toBeNull()
    expect(periodStepMs('monthly')).toBeNull()
  })

  it('裁剪到末尾连续段，丢掉缺口之前的数据', () => {
    const bars = [bar(0), bar(HOUR), bar(2 * HOUR), bar(4 * HOUR), bar(5 * HOUR)]

    expect(continuousTail(bars, HOUR).map((item) => item.timestamp)).toEqual([4 * HOUR, 5 * HOUR])
  })

  it('整段连续时原样返回，步长为 null 时不做裁剪', () => {
    const bars = [bar(0), bar(HOUR), bar(2 * HOUR)]

    expect(continuousTail(bars, HOUR)).toEqual(bars)
    expect(continuousTail([bar(0), bar(999)], null)).toHaveLength(2)
  })

  it('整段都断开时只剩最后一根，空序列返回空', () => {
    expect(continuousTail([bar(0), bar(7)], HOUR).map((item) => item.timestamp)).toEqual([7])
    expect(continuousTail([], HOUR)).toHaveLength(0)
  })
})
