/** 验证 Fisher、StochRSI 与 STC 发布脚本的预热与数值。 */
import { describe, expect, it } from 'vitest'
import { runShippedValues, wavyCloses } from '../../__tests__/marketData.js'

describe('振荡指标脚本', () => {
  it('StochRSI 在 RSI 窗口内取随机值，K/D 再平滑', async () => {
    const result = await runShippedValues('stoch-rsi', [1, 2, 3, 2, 1], {
      period: 2,
      kPeriod: 1,
      dPeriod: 1,
    })
    expect(result.k).toEqual([undefined, undefined, undefined, 0, 0])
    expect(result.d).toEqual([undefined, undefined, undefined, 0, 0])

    const flat = await runShippedValues('stoch-rsi', [10, 10, 10, 10], {
      period: 2,
      kPeriod: 1,
      dPeriod: 1,
    })
    expect(flat.k).toEqual([undefined, undefined, undefined, 50])
    expect(flat.d).toEqual([undefined, undefined, undefined, 50])
  })

  it('Fisher 用中位价窗口递推，signal 延后一根', async () => {
    const result = await runShippedValues('fisher', [1, 2, 3], { period: 2 })
    expect(result.fisher?.[0]).toBeUndefined()
    expect(result.fisher?.[1]).toBeCloseTo(0.3428282544, 10)
    expect(result.signal?.[1]).toBe(0)
    expect(result.signal?.[2]).toBeCloseTo(0.3428282544, 10)

    const flat = await runShippedValues('fisher', [1, 1], { period: 2 })
    expect(flat.fisher?.[1]).toBeCloseTo(-0.3428282544, 10)
    expect(flat.signal?.[1]).toBe(0)
  })

  it('STC 用 DIF 做两次随机化与 factor 平滑', async () => {
    const result = await runShippedValues('stc', wavyCloses(80), {
      fast: 2,
      slow: 3,
      cycle: 2,
      factor: 0.5,
    })
    expect(result.stc?.slice(0, 2)).toEqual([undefined, undefined])
    expect(result.stc?.[2]).toBeTypeOf('number')
    for (const value of result.stc?.slice(2) ?? []) {
      if (value === undefined) continue
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }

    const flat = await runShippedValues('stc', Array(20).fill(10), {
      fast: 2,
      slow: 3,
      cycle: 2,
      factor: 0.5,
    })
    expect(flat.stc?.slice(0, 2)).toEqual([undefined, undefined])
    expect(flat.stc?.slice(2).every((value) => value === 50)).toBe(true)
  })
})
