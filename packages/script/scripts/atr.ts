// 平均真实波幅，使用 Wilder 平滑衡量价格波动。
defineIndicator({
  name: 'ATR',
  title: '平均真实波幅',
  info: 'ATR 用真实波幅的 Wilder 平滑衡量波动强度，常用于止损距离与仓位控制。',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.atr(period), 'atr', { label: 'ATR', color: Color.Orange })
  },
})
