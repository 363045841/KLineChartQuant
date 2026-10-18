// 平均真实波幅，使用 Wilder 平滑衡量价格波动。
defineIndicator({
  name: 'ATR',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.atr(period), 'atr', { label: 'ATR', color: Color.Orange })
  },
})
