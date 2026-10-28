/** 验证 MACD 的首值 EMA、旧 core 数值、序列组合、因果性及真实执行器隔离。 */
import { Color } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import {
  barsFromCloses,
  plotValues,
  scriptSource,
  shippedSource,
  wavyCloses,
} from '../../__tests__/marketData.js'
import { macdLegacy } from './fixtures/macdLegacy.js'

describe.each(BACKENDS)('MACD TA $name', ({ prepare }) => {
  it.each(macdLegacy)(
    '参数 $fastPeriod/$slowPeriod/$signalPeriod 复现旧 core 检查点',
    (reference) => {
      const { fastPeriod, slowPeriod, signalPeriod } = reference
      const prepared = prepare(
        scriptSource(`
      const [dif, dea, histogram] = ta.macd(close, ${fastPeriod}, ${slowPeriod}, ${signalPeriod})
      plot.Line(dif[0], 'dif')
      plot.Line(dea[0], 'dea')
      plot.Columns(histogram[0] * 2, 'bar')
      plot.Line(dif[1], 'previous')
    `),
      )
      const bars = barsFromCloses(wavyCloses(60))
      const actual = plotValues(prepared.run(bars))
      for (const [index, dif, dea, bar] of reference.checkpoints) {
        expect(actual.dif?.[index]).toBeCloseTo(dif, 12)
        expect(actual.dea?.[index]).toBeCloseTo(dea, 12)
        expect(actual.bar?.[index]).toBeCloseTo(bar, 12)
      }
      expect(actual.previous).toEqual([undefined, ...actual.dif!.slice(0, -1)])
      for (const length of [1, 5, 25, 35]) {
        const prefix = plotValues(prepared.run(bars.slice(0, length)))
        for (const [id, values] of Object.entries(prefix))
          expect(values).toEqual(actual[id]?.slice(0, length))
      }
      expect(prepared.run([]).plots).toEqual([])
    },
  )

  it('不同输入与信号周期独立缓存，重复调用复用序列，现有 ta.ema 仍按完整窗口初始化', () => {
    const prepared = prepare(
      scriptSource(`
      const result = ta.macd(close, 3, 7, 2)
      const repeated = ta.macd(close, 3, 7, 2)
      if (result[0] !== repeated[0] || result[1] !== repeated[1] || result[2] !== repeated[2]) throw new Error('序列未复用')
      const [volumeDif] = ta.macd(volume, 3, 7, 2)
      const [, signalOne, zeroHistogram] = ta.macd(close, 3, 7, 1)
      plot.Line(result[0][0], 'dif')
      plot.Line(volumeDif[0], 'volumeDif')
      plot.Line(signalOne[0], 'signalOne')
      plot.Line(zeroHistogram[0], 'zeroHistogram')
      plot.Line(ta.ema(close, 3)[0], 'ema')
    `),
    )
    const closes = wavyCloses(60)
    const result = plotValues(
      prepared.run(barsFromCloses(closes, { volumes: closes.map((value) => value * 2) })),
    )
    result.dif!.forEach((value, index) =>
      expect(result.volumeDif?.[index]).toBeCloseTo(value! * 2, 12),
    )
    expect(result.signalOne).toEqual(result.dif)
    expect(result.zeroHistogram).toEqual(Array(60).fill(0))
    expect(result.ema?.slice(0, 2)).toEqual([undefined, undefined])
    expect(result.ema?.[2]).toBeCloseTo((closes[0]! + closes[1]! + closes[2]!) / 3, 12)
  })

  it.each(['0, 26, 9', '12, -1, 9', '12, 26, 1.5', 'NaN, 26, 9'])('拒绝无效周期 %s', (periods) => {
    expect(() =>
      prepare(scriptSource(`ta.macd(close, ${periods})`)).run(barsFromCloses([1])),
    ).toThrow()
  })

  it('输入 NaN 时留空，恢复后按首值重新初始化三条序列', () => {
    const prepared = prepare(
      scriptSource(`
      const [dif, dea, histogram] = ta.macd(close, 3, 7, 2)
      plot.LineBR(dif[0], 'dif')
      plot.LineBR(dea[0], 'dea')
      plot.Columns(histogram[0], 'histogram')
    `),
    )
    const prices = wavyCloses(6)
    prices[2] = NaN
    const result = plotValues(prepared.run(barsFromCloses(prices)))
    for (const values of Object.values(result)) {
      expect(values[2]).toBeUndefined()
      expect(values[3]).toBe(0)
      expect(Number.isFinite(values[4])).toBe(true)
    }
  })

  it('发布 MACD 脚本保留默认参数、翻倍柱体与四种柱色', () => {
    const prepared = prepare(shippedSource('macd'))
    expect(prepared.definition).toMatchObject({
      name: 'MACD',
      position: 'sub',
      inputs: {
        fastPeriod: { default: 12 },
        slowPeriod: { default: 26 },
        signalPeriod: { default: 9 },
      },
    })
    const result = prepared.run(barsFromCloses(wavyCloses(60)))
    expect(result.plots.map((plot) => plot.kind)).toEqual(['columns', 'linebr', 'linebr'])
    const actual = plotValues(result)
    for (const [index, dif, dea, bar] of macdLegacy[0].checkpoints) {
      expect(actual.dif?.[index]).toBeCloseTo(dif, 12)
      expect(actual.dea?.[index]).toBeCloseTo(dea, 12)
      expect(actual.bar?.[index]).toBeCloseTo(bar, 12)
    }
    const colors = result.plots[0]!.data.map((point) => point?.color)
    expect(new Set(colors)).toEqual(
      new Set([Color.Teal, Color.Teal + '80', Color.Red, Color.Red + '80']),
    )
    expect(colors[1]).toBe(Color.Teal)
    expect(colors[25]).toBe(Color.Red)
    expect(colors[33]).toBe(Color.Red + '80')
    expect(colors[59]).toBe(Color.Teal + '80')
  })
})
