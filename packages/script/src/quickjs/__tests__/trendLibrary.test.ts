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

describe.each([prepareNativeScript, prepareQuickJSScript])('TA 趋势库 %s', (prepare) => {
  beforeAll(preloadQuickJS)

  it('Supertrend 三组参数逐点复现旧 core 数值与全部趋势切换', () => {
    const source = scriptSource(
      supertrendLegacy.map(({ atrPeriod, multiplier }, index) => `
      const [trend${index}, direction${index}] = ta.supertrend(${multiplier}, ${atrPeriod})
      plot.Line(trend${index}[0], 'value${index}')
      plot.Line(direction${index}[0], 'direction${index}')
      plot.Line(trend${index}[1], 'previous${index}')
      `).join('\n'),
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
    const prepared = prepare(scriptSource(`
      plot.Line(ta.atr(3)[0], 'atr')
      plot.Line(ta.atr(3)[1], 'previous')
      plot.Line(ta.atr(1)[0], 'range')
      plot.Line(ta.atr(10)[0], 'warming')
    `))
    const result = plotValues(prepared.run(barsFromCloses(wavyCloses(6), { spread: 0.5 })))
    const expected = [1.1364047535370172, 1.1471515071427487, 1.1402049353714647, 1.1172094299471194]
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
    const result = prepared.run(
      barsFromCloses(wavyCloses(50), { spread: 0.5 }),
      { atrPeriod: reference.atrPeriod, multiplier: reference.multiplier },
    )
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
    const prepared = prepare(scriptSource(`
      const [trend, direction] = ta.supertrend(3, 10)
      plot.Line(trend[0], 'trend')
      plot.Line(direction[0], 'direction')
    `))
    const prices = Array.from({ length: 4000 }, (_, index) => 100 + index)
    const { trend, direction } = plotValues(
      prepared.run(barsFromCloses([...prices, 0], { spread: 0.5 })),
    )
    expect(direction?.[3999]).toBe(-1)
    expect(direction?.[4000]).toBe(1)
    expect(Number.isFinite(trend?.[4000])).toBe(true)
  })
})
