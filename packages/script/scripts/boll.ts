// 布林通道：收盘价均线加减总体标准差倍数。
defineIndicator({
  name: 'BOLL',
  title: '布林带',
  info: '布林带由三条轨道线组成，用于判断价格的波动范围和趋势强度。价格触及上轨可能超买，触及下轨可能超卖。',
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
