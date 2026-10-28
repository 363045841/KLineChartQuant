// 威廉指标：STOCH 减 100，结果落在 [-100, 0]；零幅窗口输出 -50。
// 超买/超卖参考线是图表级声明，不参与数据列与数值范围。
hline(-20, { color: Color.Gray, linestyle: HLineStyle.style_dashed })
hline(-50, { color: Color.Gray, linestyle: HLineStyle.style_dashed })
hline(-80, { color: Color.Gray, linestyle: HLineStyle.style_dashed })

defineIndicator({
  name: 'WMSR',
  title: '威廉指标',
  info: '威廉指标衡量超买超卖程度，范围为 -100 到 0。WMSR > -20 超买，WMSR < -80 超卖。',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    const value = ta.stoch(close, high, low, period) - 100
    plot.Line(value, 'wmsr', { label: 'WMSR', color: Color.Purple })
  },
})
