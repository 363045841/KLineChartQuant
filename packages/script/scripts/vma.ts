// 成交量的简单移动平均，观察量能趋势。
defineIndicator({
  name: 'VMA',
  title: '成交量移动平均',
  info: 'VMA 是成交量的移动平均，用于观察量能趋势与放量/缩量。',
  position: Position.Sub,
  format: Format.Volume,
  onBar() {
    const period = input.int(5, { title: '周期', min: 1 })
    plot.Line(ta.sma(volume, period), 'vma', { label: 'VMA', color: Color.Orange })
  },
})
