/** 验证完整脚本在两种后端的 OHLC 输出、缺值和独立着色语义。 */
import { Color, DEFAULT_PLOT_COLOR } from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { barsFromCloses } from '../../__tests__/marketData.js'
import { preloadQuickJS, prepareQuickJSScript } from '../../quickjs/impl/runQuickJSScript.js'
import { prepareNativeScript } from '../impl/prepareNativeScript.js'

beforeAll(preloadQuickJS)

/** 为调用片段补上完整指标声明，保留真实编译和逐 bar 执行链路。 */
function source(body: string): string {
  return `defineIndicator({ name: 'OHLC', position: 'main', onBar() { ${body} } })`
}

describe.each([
  { name: 'Native', prepare: prepareNativeScript },
  { name: 'QuickJS', prepare: prepareQuickJSScript },
])('$name OHLC plots', ({ prepare }) => {
  it('四价格归一化、逐 bar 独立颜色及不同 Plot 的输出顺序', () => {
    const script = prepare(
      source(`
      plot.Line(close, 'line')
      plot.Candle(open, low, high, close, 'candles', {
        color: close >= open ? Color.Green : Color.Red,
        wickColor: Color.Gray, borderColor: null,
      })
      plot.Bar(open, high, low, close, 'bars', { color: Color.Blue, showLast: 1, offset: 2 })
    `),
    )
    const bars = barsFromCloses([10, 20, 5], { spread: 2 }).map((bar, index) => ({
      ...bar,
      open: bar.close + (index === 1 ? 1 : -1),
    }))
    const result = script.run(bars)
    expect(result.plots.map((plot) => plot.id)).toEqual(['line', 'candles', 'bars'])
    const candle = result.plots[1]
    if (candle?.kind !== 'candle') throw new Error('Missing Candle Plot')
    expect(candle.data).toEqual(
      bars.map((bar) => ({
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        color: bar.close >= bar.open ? Color.Green : Color.Red,
        wickColor: Color.Gray,
        borderColor: null,
      })),
    )
    expect(result.plots[2]).toMatchObject({ kind: 'bar', showLast: 1, offset: 2 })
  })

  it('缺少任意一个价格则整根留空，0 有效，无穷值留空', () => {
    const result = prepare(
      source(`
      plot.Candle(0, 0, 0, 0, 'zero')
      plot.Candle(null, high, low, close, 'null')
      plot.Bar(open, NaN, low, close, 'nan')
      plot.Bar(open, high, -Infinity, close, 'infinite')
      plot.Candle(20, 3, 7, -2, 'normalized')
    `),
    ).run(barsFromCloses([10]))
    expect(result.plots[0]?.data[0]).toEqual({
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      color: DEFAULT_PLOT_COLOR,
      wickColor: DEFAULT_PLOT_COLOR,
      borderColor: DEFAULT_PLOT_COLOR,
    })
    for (const plot of result.plots.slice(1, 4)) expect(plot.data).toEqual([undefined])
    expect(result.plots[4]?.data[0]).toMatchObject({ open: 20, high: 20, low: -2, close: -2 })
  })

  it('null 隐藏实体且不影响单独传入的影线和边框颜色', () => {
    const result = prepare(
      source(`plot.Candle(open, high, low, close, 'hollow', {
      color: null, wickColor: Color.Gray, borderColor: Color.Blue,
    })`),
    ).run(barsFromCloses([10]))
    expect(result.plots[0]?.data[0]).toMatchObject({
      color: null,
      wickColor: Color.Gray,
      borderColor: Color.Blue,
    })
  })

  it.each([
    `plot.Candle('bad', 2, 1, 2, 'bad')`,
    `plot.Bar(1, 2, 0, 2, 'bad', { showLast: 0 })`,
    `plot.Bar(1, 2, 0, 2, 'bad', { wickColor: Color.Red })`,
    `plot.Candle(1, 2, 0, 2, '', {})`,
    `plot.Candle(1, 2, 0, 2, 'same'); plot.Line(1, 'same')`,
    `plot.Line(1, 'same'); plot.Candle(1, 2, 0, 2, 'same')`,
    `plot.Candle(1, 2, 0, 2, 'same'); plot.Bar(1, 2, 0, 2, 'same')`,
    `plot.Candle(1, 2, 0, 2, 'candles'); const line = plot.Line(1, 'line'); fill({name:'candles'}, line, Color.Blue)`,
  ])('拒绝非法调用：%s', (body) => {
    expect(() => prepare(source(body)).run(barsFromCloses([10]))).toThrow()
  })

  it('禁止在声明阶段绘图，不返回 fill 句柄', () => {
    expect(() => prepare(`plot.Bar(1, 2, 0, 2, 'bad'); ${source('')}`)).toThrow()
    expect(() =>
      prepare(
        source(`
      const candle = plot.Candle(open, high, low, close, 'candles')
      if (candle !== undefined) throw new Error('Unexpected PlotRef')
    `),
      ).run(barsFromCloses([10])),
    ).not.toThrow()
  })

  it('同名 OHLC 的整列样式在一次运行中必须固定', () => {
    const script = prepare(source(`plot.Bar(open, high, low, close, 'bars', { showLast: close })`))
    expect(() => script.run(barsFromCloses([1, 2]))).toThrow('cannot change style')
  })
})
