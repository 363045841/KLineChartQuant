// Hull 移动平均主图指标。
defineIndicator({
  name: 'HMA',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.hma(close, period), 'hma', { label: 'HMA', color: Color.Blue })
  },
})
