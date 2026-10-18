// 均线按百分比上下偏移形成 ENE 价格轨道。
defineIndicator({
  name: 'ENE',
  position: Position.Main,
  onBar() {
    const period = input.int(10, { title: '周期', min: 1 })
    const deviation = input.float(11, { title: '偏离率（%）', min: 0, step: 0.5 })
    const middle = ta.sma(close, period)[0]
    plot.Line(middle * (1 + deviation / 100), 'upper', { label: 'UP', color: Color.Red })
    plot.Line(middle, 'middle', { label: 'MID', color: Color.Orange })
    plot.Line(middle * (1 - deviation / 100), 'lower', { label: 'DN', color: Color.Blue })
  },
})
