/** 验证均线与通道发布脚本的公式、有效窗口、位移及重算隔离。 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  plotValues,
  scriptSource,
  shippedSource,
  wavyCloses,
} from '../../__tests__/marketData.js'
import { preloadQuickJS, runQuickJSScript } from '../impl/runQuickJSScript.js'

const names = [
  'alma',
  'smma',
  'zlema',
  'kama',
  'vidya',
  'lsma',
  'atr',
  'ma',
  'expma',
  'dema',
  'tema',
  't3',
  'trima',
  'gmma',
  'ene',
  'vma',
  'vwma',
  'keltner',
  'dpo',
  'pivot',
  'ichimoku',
]

/** 执行发布源码，允许逐用例设置窗口和显示参数。 */
async function run(
  name: string,
  prices: readonly number[],
  params: Record<string, number | boolean> = {},
) {
  return runQuickJSScript({ source: shippedSource(name), bars: barsFromCloses(prices), params })
}

describe('均线与通道脚本', () => {
  beforeAll(preloadQuickJS)

  it.each(names)('%s 能执行空输入与长历史，追加历史不改写已有结果', async (name) => {
    expect(plotValues(await run(name, []))).toEqual({})
    const prices = wavyCloses(160)
    const full = plotValues(await run(name, prices))
    const prefix = plotValues(await run(name, prices.slice(0, 120)))
    for (const [id, values] of Object.entries(full)) {
      expect(values.at(-1), id).toBeTypeOf('number')
      expect(values.filter((value) => value !== undefined).every(Number.isFinite), id).toBe(true)
      expect(values.slice(0, 120), id).toEqual(prefix[id])
    }
  })

  it.each([
    { name: 'dema', warmup: 4, expected: 7 },
    { name: 'tema', warmup: 6, expected: 9 },
    { name: 't3', warmup: 12, expected: 14.1 },
    { name: 'trima', warmup: 2, expected: 14 },
  ])('$name 的组合预热和线性价格参考值正确', async ({ name, warmup, expected }) => {
    const values = plotValues(
      await run(
        name,
        Array.from({ length: 15 }, (_, i) => i + 1),
        { period: 3 },
      ),
    )[name]!
    expect(values.slice(0, warmup)).toEqual(Array(warmup).fill(undefined))
    expect(values[warmup]).toBeTypeOf('number')
    if (name === 'dema') expect(values[6]).toBeCloseTo(expected, 10)
    else if (name === 'tema') expect(values[8]).toBeCloseTo(expected, 10)
    else expect(values[14]).toBeCloseTo(expected, 10)
  })

  it.each(['dema', 'tema', 't3', 'trima'])('%s 周期 1 等于输入', async (name) => {
    const prices = [1, 4, 2, 8]
    const values = plotValues(await run(name, prices, { period: 1 }))[name]!
    values.forEach((value, index) => expect(value).toBeCloseTo(prices[index]!, 10))
  })

  it('T3 因子为零退化为第三层 EMA，因子越界与非法窗口拒绝执行', async () => {
    const bars = barsFromCloses([1, 4, 2, 8, 3, 7, 6, 10])
    const source = scriptSource(
      `plot.Line(ta.t3(close, 2, 0), 't3'); plot.Line(ta.ema(ta.ema(ta.ema(close, 2), 2), 2), 'third');`,
    )
    const values = plotValues(await runQuickJSScript({ source, bars }))
    expect(values.t3?.slice(6)).toEqual(values.third?.slice(6))
    for (const expression of [
      'ta.t3(close, 2, 1.1)',
      'ta.dema(close, 0)',
      'ta.tema(close, -1)',
      'ta.trima(close, 1.5)',
    ]) {
      await expect(
        runQuickJSScript({ source: scriptSource(`plot.Line(${expression}, 'value');`), bars }),
      ).rejects.toThrow()
    }
  })

  it('TRIMA 偶数窗口具有对称三角权重', async () => {
    const values = plotValues(await run('trima', [1, 2, 4, 8, 16], { period: 4 })).trima!
    expect(values.slice(0, 3)).toEqual(Array(3).fill(undefined))
    expect(values[3]).toBeCloseTo((1 + 2 * 2 + 2 * 4 + 8) / 6, 10)
    expect(values[4]).toBeCloseTo((2 + 2 * 4 + 2 * 8 + 16) / 6, 10)
  })

  it('ALMA 高斯权重与 SMMA Wilder 递推正确', async () => {
    const prices = [1, 2, 3, 4, 5]
    const alma = plotValues(await run('alma', prices, { period: 3, offset: 0.5, sigma: 6 })).alma!
    expect(alma.slice(0, 2)).toEqual([undefined, undefined])
    expect(alma[2]).toBeCloseTo(2, 10)
    expect(alma[3]).toBeCloseTo(3, 10)
    expect(alma[4]).toBeCloseTo(4, 10)
    const smma = plotValues(await run('smma', prices, { period: 3 })).smma!
    expect(smma.slice(0, 2)).toEqual([undefined, undefined])
    expect(smma[2]).toBeCloseTo(2, 10)
    expect(smma[3]).toBeCloseTo(2 + (4 - 2) / 3, 10)
    expect(smma[4]).toBeCloseTo(2 + (4 - 2) / 3 + (5 - (2 + (4 - 2) / 3)) / 3, 10)
  })

  it('ZLEMA 零滞后源与 EMA 预热正确', async () => {
    const values = plotValues(await run('zlema', [1, 2, 3, 4, 5], { period: 3 })).zlema!
    expect(values.slice(0, 2)).toEqual([undefined, undefined])
    const seed = 8 / 3
    expect(values[2]).toBeCloseTo(seed, 10)
    expect(values[3]).toBeCloseTo(seed + 0.5 * (5 - seed), 10)
    expect(values[4]).toBeCloseTo(seed + 0.5 * (5 - seed) + 0.5 * (6 - (seed + 0.5 * (5 - seed))), 10)
  })

  it('KAMA / VIDYA / LSMA 使用各自的标准定义', async () => {
    const constantPrices = Array(40).fill(9)
    const kama = plotValues(
      await run('kama', constantPrices, { period: 10, fastPeriod: 2, slowPeriod: 30 }),
    ).kama!
    expect(kama.slice(0, 9)).toEqual(Array(9).fill(undefined))
    expect(kama[9]).toBeCloseTo(9, 10)
    expect(kama[39]).toBeCloseTo(9, 10)

    const vidya = plotValues(
      await run('vidya', Array(20).fill(42), { period: 14, cmoPeriod: 9 }),
    ).vidya!
    expect(vidya.slice(0, 9)).toEqual(Array(9).fill(undefined))
    expect(vidya[9]).toBeCloseTo(42, 10)
    expect(vidya[19]).toBeCloseTo(42, 10)

    const lsma = plotValues(await run('lsma', [1, 2, 3, 4, 5], { period: 3 })).lsma!
    expect(lsma).toEqual([undefined, undefined, 3, 4, 5])
  })

  it('MA 五线各自预热，EXPMA 快慢线按 EMA 窗口初始化', async () => {
    const prices = [1, 2, 3, 4, 5]
    const ma = plotValues(
      await run('ma', prices, { period1: 2, period2: 3, period3: 4, period4: 5, period5: 1 }),
    )
    expect(ma.ma1).toEqual([undefined, 1.5, 2.5, 3.5, 4.5])
    expect(ma.ma2).toEqual([undefined, undefined, 2, 3, 4])
    expect(ma.ma5).toEqual(prices)
    const expma = plotValues(await run('expma', prices, { fastPeriod: 2, slowPeriod: 3 }))
    expect(expma.fast).toEqual(ma.ma1)
    expect(expma.slow).toEqual(ma.ma2)
    const hidden = await run('ma', prices, { showMA1: false })
    expect(hidden.plots.find((plot) => plot.id === 'ma1')?.visible).toBe(false)
  })

  it('GMMA 输出固定十二周期，短长期组可独立隐藏', async () => {
    const result = await run('gmma', wavyCloses(80), { showShort: false })
    expect(result.plots).toHaveLength(12)
    expect(
      result.plots.filter((plot) => plot.id.startsWith('short')).every((plot) => !plot.visible),
    ).toBe(true)
    expect(
      result.plots.filter((plot) => plot.id.startsWith('long')).every((plot) => plot.visible),
    ).toBe(true)
  })

  it('ENE 百分比轨道、Keltner ATR 半宽和 DPO 历史价差正确', async () => {
    const prices = [1, 2, 3, 4, 5, 6]
    const ene = plotValues(await run('ene', prices, { period: 3, deviation: 10 }))
    expect(ene.middle?.[2]).toBe(2)
    expect(ene.upper?.[2]).toBeCloseTo(2.2, 10)
    expect(ene.lower?.[2]).toBeCloseTo(1.8, 10)
    const atr = plotValues(await run('atr', prices, { period: 2 })).atr!
    const keltner = plotValues(
      await run('keltner', prices, { emaPeriod: 3, atrPeriod: 2, multiplier: 2 }),
    )
    expect(keltner.middle?.[2]).toBe(2)
    expect(keltner.upper?.[2]).toBeCloseTo(2 + 2 * atr[2]!, 10)
    expect(keltner.lower?.[2]).toBeCloseTo(2 - 2 * atr[2]!, 10)
    expect(plotValues(await run('dpo', prices, { period: 4 })).dpo).toEqual([
      undefined,
      undefined,
      undefined,
      -1.5,
      -1.5,
      -1.5,
    ])
  })

  it('VMA 与 VWMA 使用实际成交量，零成交量窗口留空且可恢复', async () => {
    const bars = barsFromCloses([1, 3, 8, 4]).map((bar, index) => ({
      ...bar,
      volume: [0, 0, 2, 6][index]!,
    }))
    const vma = plotValues(
      await runQuickJSScript({ source: shippedSource('vma'), bars, params: { period: 2 } }),
    )
    const vwma = plotValues(
      await runQuickJSScript({ source: shippedSource('vwma'), bars, params: { period: 2 } }),
    )
    expect(vma.vma).toEqual([undefined, 0, 1, 4])
    expect(vwma.vwma).toEqual([undefined, undefined, 8, 5])
  })

  it('Pivot 只使用前一根图表 K 线计算支撑阻力', async () => {
    const bars = [
      { time: 1, open: 8, high: 12, low: 6, close: 9, volume: 1 },
      { time: 2, open: 30, high: 40, low: 20, close: 35, volume: 1 },
    ]
    const values = plotValues(await runQuickJSScript({ source: shippedSource('pivot'), bars }))
    for (const [id, expected] of Object.entries({
      pp: 9,
      r1: 12,
      r2: 15,
      r3: 18,
      s1: 6,
      s2: 3,
      s3: 0,
    })) {
      expect(values[id]).toEqual([undefined, expected])
    }
  })

  it('Ichimoku 用 Plot 位移表达先行与迟行，云带引用相同偏移边界', async () => {
    const result = await run('ichimoku', [1, 2, 3, 4, 5, 6], {
      tenkanPeriod: 2,
      kijunPeriod: 3,
      spanBPeriod: 4,
      displacement: 2,
    })
    const values = plotValues(result)
    expect(values.tenkan?.[2]).toBe(2.5)
    expect(values.kijun?.[2]).toBe(2)
    expect(values.spanA?.[2]).toBe(2.25)
    expect(values.spanB?.[3]).toBe(2.5)
    expect(values.chikou).toEqual([1, 2, 3, 4, 5, 6])
    expect(result.plots.find((plot) => plot.id === 'spanA')?.offset).toBe(2)
    expect(result.plots.find((plot) => plot.id === 'spanB')?.offset).toBe(2)
    expect(result.plots.find((plot) => plot.id === 'chikou')?.offset).toBe(-2)
    expect(result.fills).toHaveLength(1)
  })
})
