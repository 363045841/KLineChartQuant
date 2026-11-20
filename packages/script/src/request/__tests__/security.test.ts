/** 使用完整脚本和已有行情构造验证双后端的跨周期计算与隔离。 */
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import { barsFromCloses, plotById } from '../../__tests__/marketData.js'

describe.each(BACKENDS)('$name Request', ({ prepare }) => {
  it('目标周期独立计算均线，并按实际时间戳对齐', () => {
    const script = prepare(`defineIndicator({name:'Request',position:Position.Main,onBar(){
      const length = input.int(2)
      const value = request.security(syminfo.tickerid, '60', () => ta.sma(close, length), { source: DataSource.Binance })
      plot.Line(value, 'ma')
    }})`)
    const target = barsFromCloses([10, 20, 30]).map((bar, i) => ({ ...bar, time: i * 3600000 }))
    const bars = barsFromCloses([1, 2, 3, 4, 5, 6]).map((bar, i) => ({ ...bar, time: i * 1800000 }))
    expect(script.requests({}, 'BTCUSDT')).toEqual([
      { id: '0', symbol: 'BTCUSDT', timeframe: '60', source: 'binance', mode: 'security' },
    ])
    const result = script.run(
      bars,
      {},
      { symbol: 'BTCUSDT', snapshots: [{ id: '0', bars: target }] },
    )
    const plot = plotById(result, 'ma')
    expect(plot.data.map((point) => point?.value)).toEqual([
      undefined,
      undefined,
      undefined,
      15,
      15,
      25,
    ])
  })

  it('目标周期可以直接写 Timeframe 枚举', () => {
    const script = prepare(`defineIndicator({name:'EnumRequest',position:Position.Main,onBar(){
      const value = request.security(syminfo.tickerid, Timeframe.Day, () => close)
      plot.Line(value, 'daily')
    }})`)
    expect(script.requests({}, 'BTCUSDT')).toEqual([{ id: '0', symbol: 'BTCUSDT', timeframe: 'D', mode: 'security' }])
  })

  it('元组可以直接作为蜡烛输入，脚本不能写入共享结果', () => {
    const script = prepare(`defineIndicator({name:'Candles',position:Position.Main,onBar(){
      const [o,h,l,c] = request.security('BTCUSDT','60',()=>[open,high,low,close] as const)
      plot.Candle(o,h,l,c,'candles')
    }})`)
    const bars = barsFromCloses([5, 10])
    const result = script.run(bars, {}, { symbol: 'BTCUSDT', snapshots: [{ id: '0', bars }] })
    expect(result.plots[0]?.data[1]).toMatchObject({ open: 10, close: 10 })
    expect(result.plots[0]?.data[0]).toMatchObject({ open: 5, close: 5 })
  })

  it.each([
    {
      name: '捕获局部行情',
      body: `const price = close + 1; request.security('BTCUSDT','60',()=>price)`,
    },
    {
      name: '嵌套请求',
      body: `request.security('BTCUSDT','60',()=>request.security('BTCUSDT','D',()=>close))`,
    },
    {
      name: '动态品种',
      body: `const symbol = close > 1 ? 'A':'B'; request.security(symbol,'60',()=>close)`,
    },
  ])('拒绝$name', ({ body }) => {
    expect(() =>
      prepare(`defineIndicator({name:'Invalid',position:Position.Main,onBar(){${body}}})`),
    ).toThrow()
  })

  it.each([
    { name: '参数个数不足', body: `request.security('BTCUSDT','60')` },
    {
      name: '参数过多',
      body: `request.security('BTCUSDT','60',()=>close,{},'extra')`,
    },
  ])('拒绝$name的请求', ({ body }) => {
    expect(() =>
      prepare(`defineIndicator({name:'Invalid',position:Position.Main,onBar(){${body}}})`),
    ).toThrow('request.security 需要品种、周期、回调和可选选项')
  })
})
