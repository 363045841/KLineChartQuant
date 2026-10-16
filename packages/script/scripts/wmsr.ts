// 威廉指标，完整窗口内最高最低价相同时取中值 -50。
defineIndicator({
  name: 'WMSR',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    const upper = ta.highest(high, period)
    const lower = ta.lowest(low, period)
    const value = upper === lower ? -50 : (-100 * (upper - close)) / (upper - lower)
    plot.Line(value, 'wmsr', { label: 'WMSR', color: Color.Purple })
    for (const level of [-20, -50, -80]) {
      plot.Line(level, 'guide' + level, {
        label: String(level),
        color: Color.Gray,
        dash: [4, 4],
      })
    }
  },
})
