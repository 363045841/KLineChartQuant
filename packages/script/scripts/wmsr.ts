// 威廉指标：STOCH 减 100，结果落在 [-100, 0]；零幅窗口输出 -50。
defineIndicator({
  name: 'WMSR',
  title: '威廉指标',
  info: '威廉指标衡量超买超卖程度，范围为 -100 到 0。WMSR > -20 超买，WMSR < -80 超卖。',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    const value = ta.stoch(close, high, low, period) - 100
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
