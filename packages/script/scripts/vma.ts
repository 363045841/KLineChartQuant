// 成交量的简单移动平均，观察量能趋势。
defineIndicator({
  name: 'VMA',
  position: Position.Sub,
  onBar() {
    const period = input.int(5, { title: '周期', min: 1 })
    plot.Line(ta.sma(volume, period), 'vma', { label: 'VMA', color: Color.Orange })
  },
})
