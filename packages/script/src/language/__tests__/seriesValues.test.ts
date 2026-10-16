/** 使用真实编译器与 VM 验证数值语法糖和完整序列契约。 */
import { describe, expect, it } from 'vitest'
import { barsFromCloses, plotValues, scriptSource, values } from '../../__tests__/marketData.js'
import { runQuickJSScript } from '../../quickjs/impl/runQuickJSScript.js'

describe('Series 当前值语法糖', () => {
  it('按 inputs 推导 typeof params 参数的数值上下文', async () => {
    const result = await runQuickJSScript({
      source: `
        const defaults = { level: input(2) }
        const declare = defineIndicator
        declare({
          name: 'ParameterContext',
          inputs: { ...defaults },
          onBar() {
            function double(value: typeof params.level): number { return value * 2 }
            plot.Line(double(close), { id: 'value' })
          },
        })
      `,
      bars: barsFromCloses([2, 4]),
    })
    expect(values(result, 'value')).toEqual([4, 8])
  })

  it('支持运算、序列别名、函数参数和派生序列，历史读取保持不变', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        const src = close
        const average = ta.sma(src, 2)
        function double(value: number): number { return value * 2 }
        plot.Line(src, { id: 'current' })
        plot.Line(high - low, { id: 'range' })
        plot.Line(src[1], { id: 'previous' })
        plot.Line(average, { id: 'average' })
        plot.Line(double(close), { id: 'double' })
        plot.Line(Math.max(high, close), { id: 'max' })
        plot.Line(close === high ? close : low, { id: 'equal' })
        const value = close || high
        const alias = value
        function select() { return close || low }
        const maybe = close > open ? close : 0
        const object: { close: number } = { close }
        plot.Line(alias, { id: 'logical' })
        plot.Line(select(), { id: 'returned' })
        plot.Line(maybe, { id: 'conditional' })
        plot.Line(object.close, { id: 'property' })
      `),
      bars: barsFromCloses([2, 4, 8]).map((bar) => ({
        ...bar,
        high: bar.close + 1,
        low: bar.close - 1,
      })),
    })
    expect(plotValues(result)).toEqual({
      current: [2, 4, 8],
      range: [2, 2, 2],
      previous: [undefined, 2, 4],
      average: [undefined, 3, 6],
      double: [4, 8, 16],
      max: [3, 5, 9],
      equal: [1, 3, 7],
      logical: [2, 4, 8],
      returned: [2, 4, 8],
      conditional: [0, 0, 0],
      property: [2, 4, 8],
    })
  })

  it('局部同名参数不覆盖行情序列', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        function offset(close: number): number { return close + 1 }
        plot.Line(offset(2), { id: 'local' })
      `),
      bars: barsFromCloses([2, 4]),
    })
    expect(values(result, 'local')).toEqual([3, 3])
  })
})
