// 布林通道：收盘价均线加减总体标准差倍数。
defineIndicator({
  name: 'BOLL',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    const multiplier = input.float(2, { title: '标准差倍数', step: 0.1 })
    const middle = ta.sma(close, period)
    const deviation = ta.stddev(close, period) * multiplier
    plot.Line(middle + deviation, 'upper', { label: 'UP', color: Color.Red })
    plot.Line(middle, 'middle', { label: 'MID', color: Color.Orange })
    plot.Line(middle - deviation, 'lower', { label: 'DN', color: Color.Blue })
  },
})
