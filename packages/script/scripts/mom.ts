// 动量指标：当前收盘价与指定周期前收盘价之差。
defineIndicator({
  name: 'MOM',
  position: Position.Sub,
  onBar() {
    const period = input.int(10, { title: '周期', min: 1 })
    const value = ta.mom(close, period)
    plot.Line(value, 'mom', { label: 'MOM', color: Color.Orange })
    plot.Line(0, 'zero', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
