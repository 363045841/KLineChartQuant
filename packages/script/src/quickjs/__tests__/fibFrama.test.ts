/** 验证 Fib 与 FRAMA 脚本的方向、回撤位与分形平滑。 */
import { describe, expect, it } from 'vitest'
import {
  plotValues,
  requireValues,
  runShipped,
  runShippedValues,
  type ScriptResult,
  wavyCloses,
} from '../../__tests__/marketData.js'

/** 按 Ehlers 的分形维数公式复算 FRAMA，作为脚本数值参考。 */
function framaReference(closes: readonly number[], period: number): (number | undefined)[] {
  const output = new Array<number | undefined>(closes.length).fill(undefined)
  const half = period / 2
  let previous = Number.NaN
  for (let index = period - 1; index < closes.length; index++) {
    let firstHigh = -Infinity
    let firstLow = Infinity
    let secondHigh = -Infinity
    let secondLow = Infinity
    let fullHigh = -Infinity
    let fullLow = Infinity
    for (let step = 0; step < period; step++) {
      const value = closes[index - step]!
      if (value > fullHigh) fullHigh = value
      if (value < fullLow) fullLow = value
      // 当前一半是 [i-half+1, i]，另一半是更早的 [i-period+1, i-half]。
      if (step < half) {
        if (value > secondHigh) secondHigh = value
        if (value < secondLow) secondLow = value
      } else {
        if (value > firstHigh) firstHigh = value
        if (value < firstLow) firstLow = value
      }
    }
    const n1 = (firstHigh - firstLow) / half
    const n2 = (secondHigh - secondLow) / half
    const n3 = (fullHigh - fullLow) / period
    let alpha: number
    if (n1 <= 0 || n2 <= 0 || n3 <= 0) {
      alpha = 2 / (period + 1)
    } else {
      const dimension = (Math.log(n1 + n2) - Math.log(n3)) / Math.LN2
      alpha = Math.exp(-4.6 * (dimension - 1))
      if (!(alpha > 0)) alpha = 0.01
      if (alpha > 1) alpha = 1
    }
    const current = closes[index]!
    previous = Number.isNaN(previous) ? current : alpha * current + (1 - alpha) * previous
    output[index] = previous
  }
  return output
}

describe('Fib 与 FRAMA 脚本', () => {
  /** 回撤位在每根 bar 上必须保持严格单调；缺失点直接失败，不把 undefined 混进比较。 */
  function expectRetracementOrder(
    result: ScriptResult,
    ids: readonly string[],
    ascending: boolean,
  ): void {
    const series = ids.map((id) => requireValues(result, id))
    for (let index = 9; index < series[0]!.length; index++) {
      for (let order = 1; order < series.length; order++) {
        const previous = series[order - 1]![index]!
        const current = series[order]![index]!
        if (ascending) expect(current).toBeGreaterThan(previous)
        else expect(current).toBeLessThan(previous)
      }
    }
  }

  it('Fib 上涨段方向向上，回撤位从高到低且全部为阶梯线', async () => {
    const closes = Array.from({ length: 30 }, (_, index) => 100 + index)
    const result = await runShipped('fib', closes, { period: 10 }, { spread: 0.5 })
    expect(result.plots).toHaveLength(7)
    expect(result.plots.every((plot) => plot.kind === 'stepline')).toBe(true)
    const values = plotValues(result)
    expect(values.high?.[8]).toBeUndefined()
    expect(values.high?.[9]).toBeCloseTo(109.5, 10)
    expect(values.low?.[9]).toBeCloseTo(99.5, 10)
    expect(values['236']?.[9]).toBeCloseTo(109.5 - 10 * 0.236, 10)
    expect(values['500']?.[9]).toBeCloseTo(104.5, 10)
    expectRetracementOrder(result, ['236', '382', '500', '618', '786'], false)
  })

  it('Fib 下跌段方向向下，回撤位从低到高', async () => {
    const closes = Array.from({ length: 30 }, (_, index) => 200 - index)
    const result = await runShipped('fib', closes, { period: 10 }, { spread: 0.5 })
    const values = plotValues(result)
    expect(values.high?.[9]).toBeCloseTo(200.5, 10)
    expect(values.low?.[9]).toBeCloseTo(190.5, 10)
    expect(values['236']?.[9]).toBeCloseTo(190.5 + 10 * 0.236, 10)
    expectRetracementOrder(result, ['236', '382', '500', '618', '786'], true)
  })

  it('FRAMA 预热、分形 alpha 与参考公式一致', async () => {
    const closes = wavyCloses(60)
    const values = await runShippedValues('frama', closes, { period: 16 })
    const expected = framaReference(closes, 16)
    expect(values.frama?.slice(0, 15)).toEqual(Array(15).fill(undefined))
    expected.forEach((value, index) => {
      if (value === undefined) expect(values.frama?.[index]).toBeUndefined()
      else expect(values.frama?.[index]).toBeCloseTo(value, 8)
    })
  })

  it('FRAMA 线性窗口 alpha 截断到 1，奇数周期留空', async () => {
    const values = await runShippedValues('frama', [1, 2, 3, 4, 5], { period: 4 })
    expect(values.frama?.[2]).toBeUndefined()
    expect(values.frama?.[3]).toBeCloseTo(4, 12)
    expect(values.frama?.[4]).toBeCloseTo(5, 12)
    const odd = await runShippedValues('frama', [1, 2, 3, 4, 5], { period: 5 })
    expect(odd.frama?.every((value) => value === undefined)).toBe(true)
  })
})
