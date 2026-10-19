// 斐波那契回撤：滚动窗口高低点、方向与 5 条回撤位，全部按阶梯线输出。
defineIndicator({
  name: 'Fib',
  position: Position.Main,
  onBar() {
    const period = input.int(50, { title: '周期', min: 5, max: 500 })
    const highOffset = ta.highestbars(high, period)[0]
    const lowOffset = ta.lowestbars(low, period)[0]
    const ready = !Number.isNaN(highOffset) && !Number.isNaN(lowOffset)
    const highPrice = ready ? high[-highOffset] : Number.NaN
    const lowPrice = ready ? low[-lowOffset] : Number.NaN
    const range = highPrice - lowPrice
    // 偏移越接近 0 表示该极值越新；高点更近时视为上涨段。
    const up = highOffset >= lowOffset
    const level = (ratio: number) => (up ? highPrice - range * ratio : lowPrice + range * ratio)
    plot.StepLine(highPrice, 'high', { label: 'HIGH', color: Color.Gray })
    plot.StepLine(lowPrice, 'low', { label: 'LOW', color: Color.Gray })
    plot.StepLine(level(0.236), '236', { label: '236', color: Color.LightBlue })
    plot.StepLine(level(0.382), '382', { label: '382', color: Color.Blue })
    plot.StepLine(level(0.5), '500', { label: '500', color: Color.Teal })
    plot.StepLine(level(0.618), '618', { label: '618', color: Color.Orange })
    plot.StepLine(level(0.786), '786', { label: '786', color: Color.Red })
  },
})
