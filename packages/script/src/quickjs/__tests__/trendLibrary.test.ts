/** 对照旧 core 参考值，验证 TA 趋势计算、历史访问、多参数缓存及两种执行器。 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  plotValues,
  scriptSource,
  shippedSource,
  wavyCloses,
} from '../../__tests__/marketData.js'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { preloadQuickJS, prepareQuickJSScript } from '../impl/runQuickJSScript.js'
import { supertrendLegacy } from './fixtures/supertrendLegacy.js'

/** 单向上涨趋势的收盘价：长时间不反转，通道只有一侧在推进。 */
function risingCloses(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 100 + index)
}

/**
 * 计数行情数组：宿主每读取一根历史行情就累加一次。
 *
 * 用宿主读取次数而不是耗时断言工作量，结论与机器速度和 CI 负载无关。
 */
function countingBars(closes: readonly number[]) {
  const bars = barsFromCloses(closes, { spread: 0.5 })
  const stats = { reads: 0 }
  const counted = new Proxy(bars, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) stats.reads++
      return Reflect.get(target, key, receiver)
    },
  })
  return { bars: counted, stats }
}

/** 反转那一根允许的额外宿主读取次数；正常实现约 9 次，一次历史回填会到千次量级。 */
const REVERSAL_BAR_READ_BUDGET = 64

describe.each([prepareNativeScript, prepareQuickJSScript])('TA 趋势库 %s', (prepare) => {
  beforeAll(preloadQuickJS)

  it('Supertrend 三组参数逐点复现旧 core 数值与全部趋势切换', () => {
    const source = scriptSource(
      supertrendLegacy
        .map(
          ({ atrPeriod, multiplier }, index) => `
      const [trend${index}, direction${index}] = ta.supertrend(${multiplier}, ${atrPeriod})
      plot.Line(trend${index}[0], 'value${index}')
      plot.Line(direction${index}[0], 'direction${index}')
      plot.Line(trend${index}[1], 'previous${index}')
      `,
        )
        .join('\n'),
    )
    const prepared = prepare(source)
    const bars = barsFromCloses(wavyCloses(50), { spread: 0.5 })
    const actual = plotValues(prepared.run(bars))
    for (const [caseIndex, reference] of supertrendLegacy.entries()) {
      const values = actual[`value${caseIndex}`]!
      expect(values).toHaveLength(reference.values.length)
      reference.values.forEach((expected, index) => {
        if (expected === null) expect(values[index]).toBeUndefined()
        else expect(values[index]).toBeCloseTo(expected, 8)
      })
      expect(actual[`direction${caseIndex}`]).toEqual(
        [...reference.trends].map((trend) => (trend === '-' ? undefined : trend === 'u' ? -1 : 1)),
      )
      expect(actual[`previous${caseIndex}`]).toEqual([undefined, ...values.slice(0, -1)])
    }
    expect(prepared.run(bars)).toEqual(prepared.run(bars))
    const prefix = plotValues(prepared.run(bars.slice(0, 25)))
    for (const [id, values] of Object.entries(prefix))
      expect(actual[id]?.slice(0, 25)).toEqual(values)
    expect(prepared.run([]).plots).toEqual([])
  })

  it('ATR 首个完整窗口、Wilder 平滑和周期 1 与原生参考值一致', () => {
    const prepared = prepare(
      scriptSource(`
      plot.Line(ta.atr(3)[0], 'atr')
      plot.Line(ta.atr(3)[1], 'previous')
      plot.Line(ta.atr(1)[0], 'range')
      plot.Line(ta.atr(10)[0], 'warming')
    `),
    )
    const result = plotValues(prepared.run(barsFromCloses(wavyCloses(6), { spread: 0.5 })))
    const expected = [
      1.1364047535370172, 1.1471515071427487, 1.1402049353714647, 1.1172094299471194,
    ]
    expect(result.atr?.slice(0, 2)).toEqual([undefined, undefined])
    expected.forEach((value, index) => expect(result.atr?.[index + 2]).toBeCloseTo(value, 12))
    expect(result.previous).toEqual([undefined, ...result.atr!.slice(0, -1)])
    expect(result.range?.[0]).toBe(1)
    expect(result.range?.[1]).toBeCloseTo(1.211858648961325, 12)
    expect(result.warming).toEqual(Array(6).fill(undefined))
  })

  it('SuperTrend 发布脚本只绘制当前方向，切换时另一条 LineBR 留空', () => {
    const reference = supertrendLegacy[1]!
    const prepared = prepare(shippedSource('supertrend'))
    expect(prepared.definition).toMatchObject({
      name: 'SuperTrend',
      position: 'main',
      inputs: { atrPeriod: { default: 10 }, multiplier: { default: 3 } },
    })
    const result = prepared.run(barsFromCloses(wavyCloses(50), { spread: 0.5 }), {
      atrPeriod: reference.atrPeriod,
      multiplier: reference.multiplier,
    })
    expect(result.plots.map((plot) => plot.kind)).toEqual(['linebr', 'linebr'])
    const { up, down } = plotValues(result)
    reference.values.forEach((value, index) => {
      const rising = reference.trends[index] === 'u'
      if (value === null) {
        expect(up?.[index]).toBeUndefined()
        expect(down?.[index]).toBeUndefined()
      } else {
        expect((rising ? up : down)?.[index]).toBeCloseTo(value, 8)
        expect((rising ? down : up)?.[index]).toBeUndefined()
      }
    })
  })

  it.each([
    'ta.atr(0)',
    'ta.atr(1.5)',
    'ta.supertrend(0, 10)',
    'ta.supertrend(Infinity, 10)',
    'ta.supertrend(3, -1)',
  ])('拒绝无效 TA 参数 %s', (call) => {
    expect(() => prepare(scriptSource(call)).run(barsFromCloses([1]))).toThrow()
  })

  it('长时间单向趋势后反转，不递归补算另一侧通道', () => {
    const prepared = prepare(
      scriptSource(`
      const [trend, direction] = ta.supertrend(3, 10)
      plot.Line(trend[0], 'trend')
      plot.Line(direction[0], 'direction')
    `),
    )
    // 两次运行的行情只差末尾一根反转 bar，读取次数之差就是那一根的工作量。
    // 递归补算另一侧通道会让这一根读取整段历史，差值随趋势长度线性膨胀。
    const rising = countingBars(risingCloses(1_000))
    const reversal = countingBars([...risingCloses(1_000), 0])
    prepared.run(rising.bars)
    const { trend, direction } = plotValues(prepared.run(reversal.bars))
    expect(direction?.[999]).toBe(-1)
    expect(direction?.[1_000]).toBe(1)
    expect(Number.isFinite(trend?.[1_000])).toBe(true)
    // 计数必须真的发生，否则下一条断言会静默失效。
    expect(rising.stats.reads).toBeGreaterThan(1_000)
    expect(reversal.stats.reads - rising.stats.reads).toBeLessThanOrEqual(REVERSAL_BAR_READ_BUDGET)
  })
})
