// 价格变化率，基期价格为零时不输出。
defineIndicator({
  name: 'ROC',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const period = input.int(12, { title: '周期', min: 1 })
    const value = ta.roc(close, period)
    plot.Line(value, 'roc', { label: 'ROC', color: Color.Purple })
    plot.Line(0, 'zero', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
