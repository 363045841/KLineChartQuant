/** 验证派生序列的惰性、递推与组合指标的独立数值参考。 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  plotValues,
  scriptSource,
  shippedSource,
  wavyCloses,
} from '../../__tests__/marketData.js'
import { preloadQuickJS, runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 按发布脚本执行，并提取所有绘图的逐 bar 数值。 */
async function run(name: string, prices: readonly number[], params: Record<string, number> = {}) {
  return plotValues(
    await runQuickJSScript({ source: shippedSource(name), bars: barsFromCloses(prices), params }),
  )
}

describe('组合指标与派生序列', () => {
  beforeAll(preloadQuickJS)

  it('derive 不预填历史，同 key 复用首次回调，self 递推遇到历史边界结束', async () => {
    const source = `let calls = 0;
      ${scriptSource(`
        const lazy = derive('lazy', (_self, offset) => { calls++; return close[offset]; });
        const same = derive('lazy', () => { throw new Error('重复创建'); });
        const sum = derive('sum', (self, offset) => {
          const previous = self[offset + 1];
          return close[offset] + (Number.isNaN(previous) ? 0 : previous);
        });
        plot.Line(calls, 'before');
        plot.Line(lazy[0] + same[0], 'double');
        plot.Line(calls, 'after');
        plot.Line(sum[0], 'sum');
        plot.Line(lazy[1], 'previous');
      `)}`
    const result = plotValues(
      await runQuickJSScript({ source, bars: barsFromCloses([2, 4, 8, 16]) }),
    )
    expect(result.before).toEqual([0, 1, 2, 3])
    expect(result.after).toEqual([1, 2, 3, 4])
    expect(result.double).toEqual([4, 8, 16, 32])
    expect(result.sum).toEqual([2, 6, 14, 30])
    expect(result.previous).toEqual([undefined, 2, 4, 8])
  })

  it('AO 与 DMA 的均线差和二次平滑具有各自的预热窗口', async () => {
    const prices = [1, 2, 3, 4, 5, 6]
    const expected = [undefined, undefined, 0.5, 0.5, 0.5, 0.5]
    expect((await run('ao', prices, { fast: 2, slow: 3 })).ao).toEqual(expected)
    const dma = await run('dma', prices, { p1: 2, p2: 3, p3: 2 })
    expect(dma.dif).toEqual(expected)
    expect(dma.ama).toEqual([undefined, undefined, undefined, 0.5, 0.5, 0.5])
  })

  it('CCI 使用当前窗口的平均绝对偏差，平盘偏差为零时输出 0', async () => {
    const result = await run('cci', [1, 2, 4, 8], { period: 3 })
    expect(result.cci?.slice(0, 2)).toEqual([undefined, undefined])
    expect(result.cci?.[2]).toBeCloseTo(100, 10)
    expect(result.cci?.[3]).toBeCloseTo(100, 10)
    expect((await run('cci', [5, 5, 5, 5], { period: 3 })).cci).toEqual([
      undefined,
      undefined,
      0,
      0,
    ])
  })

  it('HMA 的组合窗口与周期为一的边界正确', async () => {
    const prices = [1, 2, 3, 4, 5, 6]
    const result = await run('hma', prices, { period: 4 })
    expect(result.hma?.slice(0, 4)).toEqual(Array(4).fill(undefined))
    expect(result.hma?.[4]).toBeCloseTo(5, 10)
    expect(result.hma?.[5]).toBeCloseTo(6, 10)
    expect((await run('hma', prices, { period: 1 })).hma).toEqual(prices)
  })

  it('KST 按最长 ROC 与固定平滑窗口预热，信号线再延迟 signalPeriod', async () => {
    const result = await run('kst', wavyCloses(60))
    expect(result.kst?.slice(0, 44).every((value) => value === undefined)).toBe(true)
    expect(result.kst?.[44]).toBeTypeOf('number')
    expect(result.signal?.slice(0, 52).every((value) => value === undefined)).toBe(true)
    expect(result.signal?.[52]).toBeTypeOf('number')
  })

  it.each(['ao', 'cci', 'hma', 'kst', 'dma'])(
    '%s 默认参数在较长历史上持续输出有限值',
    async (name) => {
      const result = await run(name, wavyCloses(120))
      for (const values of Object.values(result)) {
        expect(values.at(-1)).toBeTypeOf('number')
        expect(values.filter((value) => value !== undefined).every(Number.isFinite)).toBe(true)
      }
    },
  )
})
