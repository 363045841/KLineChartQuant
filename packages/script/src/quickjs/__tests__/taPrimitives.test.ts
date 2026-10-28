/** 验证新增 TA 原语的窗口、偏移、权重、预热与无效参数。 */
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import { barsFromCloses, plotValues, scriptSource } from '../../__tests__/marketData.js'

describe.each(BACKENDS)('TA 新增原语 $name', ({ prepare }) => {
  it('highestbars/lowestbars 返回负偏移，并列极值与 Pine 一致取更早一根', () => {
    const prepared = prepare(
      scriptSource(`
        plot.Line(ta.highestbars(close, 3)[0], 'highbars')
        plot.Line(ta.lowestbars(close, 3)[0], 'lowbars')
      `),
    )
    const result = plotValues(prepared.run(barsFromCloses([5, 1, 5, 3, 5])))
    expect(result.highbars).toEqual([undefined, undefined, -2, -1, -2])
    expect(result.lowbars).toEqual([undefined, undefined, -1, -2, -1])
  })

  it('rma 以完整窗口 SMA 初始化并按 1/length 递推', () => {
    const prepared = prepare(scriptSource(`plot.Line(ta.rma(close, 2)[0], 'rma')`))
    const result = plotValues(prepared.run(barsFromCloses([1, 2, 3, 4, 5])))
    expect(result.rma).toEqual([undefined, 1.5, 2.25, 3.125, 4.0625])
  })

  it('swma 使用固定四根窗口与 1/6、2/6、2/6、1/6 权重', () => {
    const prepared = prepare(scriptSource(`plot.Line(ta.swma(close)[0], 'swma')`))
    const result = plotValues(prepared.run(barsFromCloses([1, 2, 3, 4, 5])))
    expect(result.swma).toEqual([undefined, undefined, undefined, 2.5, 3.5])
  })

  it('alma 使用高斯权重，floor 改变中心取整方式', () => {
    const prepared = prepare(
      scriptSource(`
        plot.Line(ta.alma(close, 2, 0.9, 6)[0], 'smooth')
        plot.Line(ta.alma(close, 2, 0.9, 6, true)[0], 'floor')
      `),
    )
    const result = plotValues(prepared.run(barsFromCloses([1, 2])))
    expect(result.smooth?.[0]).toBeUndefined()
    expect(result.smooth?.[1]).toBeCloseTo(1.9734, 3)
    expect(result.floor?.[0]).toBeUndefined()
    expect(result.floor?.[1]).toBeCloseTo(1.011, 3)
  })

  it('cmo 使用涨跌差窗口，平盘输出 0', () => {
    const prepared = prepare(scriptSource(`plot.Line(ta.cmo(close, 3)[0], 'cmo')`))
    const result = plotValues(prepared.run(barsFromCloses([1, 2, 4, 3, 5])))
    expect(result.cmo).toEqual([undefined, undefined, undefined, 50, 60])
    const flat = plotValues(prepared.run(barsFromCloses([5, 5, 5, 5])))
    expect(flat.cmo).toEqual([undefined, undefined, undefined, 0])
  })

  it('linreg 返回最小二乘拟合值并支持偏移', () => {
    const prepared = prepare(
      scriptSource(`
        plot.Line(ta.linreg(close, 3)[0], 'current')
        plot.Line(ta.linreg(close, 3, 1)[0], 'previous')
      `),
    )
    const result = plotValues(prepared.run(barsFromCloses([1, 2, 3, 4, 5])))
    expect(result.current).toEqual([undefined, undefined, 3, 4, 5])
    expect(result.previous).toEqual([undefined, undefined, 2, 3, 4])
  })

  it('stoch 用 source/high/low 计算随机指标，零幅窗口输出 50', () => {
    const prepared = prepare(
      scriptSource(`
        plot.Line(ta.stoch(close, high, low, 3)[0], 'range')
        plot.Line(ta.stoch(close, close, close, 3)[0], 'shifted')
      `),
    )
    const result = plotValues(prepared.run(barsFromCloses([1, 3, 2, 4], { spread: 1 })))
    expect(result.range).toEqual([undefined, undefined, 50, 75])
    expect(result.shifted).toEqual([undefined, undefined, 50, 100])

    const flat = plotValues(prepared.run(barsFromCloses([2, 2, 2, 2])))
    expect(flat.range).toEqual([undefined, undefined, 50, 50])
    expect(flat.shifted).toEqual([undefined, undefined, 50, 50])
  })

  it.each([
    'ta.rma(close, 0)',
    'ta.stoch(close, high, low, 0)',
    'ta.stoch(close, high, low, 1.5)',
    'ta.cmo(close, 0)',
    'ta.linreg(close, 0)',
    'ta.linreg(close, 3, 0.5)',
    'ta.highestbars(close, 0)',
    'ta.lowestbars(close, 1.5)',
    'ta.alma(close, 0)',
    'ta.alma(close, 3, -0.1)',
    'ta.alma(close, 3, 0.5, 0)',
  ])('拒绝无效 TA 参数 %s', (call) => {
    const prepared = prepare(scriptSource(`plot.Line(${call}, 'value')`))
    expect(() => prepared.run(barsFromCloses([1, 2, 3]))).toThrow()
  })
})
