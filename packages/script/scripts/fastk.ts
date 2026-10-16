// 快速随机指标，完整窗口内最高最低价相同时取中值 50。
defineIndicator({
  name: 'FASTK',
  position: Position.Sub,
  onBar() {
    const period = input.int(9, { title: '周期', min: 1 })
    const upper = ta.highest(high, period)
    const lower = ta.lowest(low, period)
    const value = upper === lower ? 50 : (100 * (close - lower)) / (upper - lower)
    plot.Line(value, 'fastk', { label: 'FASTK', color: Color.Orange })
    for (const level of [80, 50, 20]) {
      plot.Line(level, 'guide' + level, {
        label: String(level),
        color: Color.Gray,
        dash: [4, 4],
      })
    }
  },
})
