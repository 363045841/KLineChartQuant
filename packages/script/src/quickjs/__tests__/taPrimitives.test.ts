/** 验证新增 TA 原语的窗口、偏移、权重、预热与无效参数。 */
import { beforeAll, describe, expect, it } from 'vitest'
import { barsFromCloses, plotValues, scriptSource } from '../../__tests__/marketData.js'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { preloadQuickJS, prepareQuickJSScript } from '../impl/runQuickJSScript.js'

describe.each([prepareNativeScript, prepareQuickJSScript])('TA 新增原语 %s', (prepare) => {
  beforeAll(preloadQuickJS)

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

  it.each([
    'ta.rma(close, 0)',
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
