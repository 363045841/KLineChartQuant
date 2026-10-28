// 快速随机指标，完整窗口内最高最低价相同时取中值 50。
// 超买/超卖参考线是图表级声明，不参与数据列与数值范围。
for (const level of [80, 50, 20])
  hline(level, { color: Color.Gray, linestyle: HLineStyle.style_dashed })

defineIndicator({
  name: 'FASTK',
  title: '快速随机指标',
  info: 'FASTK 是未经过平滑处理的随机指标，比普通 KDJ 更敏感，能更快捕捉价格转折点，但假信号也更多。',
  position: Position.Sub,
  onBar() {
    const period = input.int(9, { title: '周期', min: 1 })
    plot.Line(ta.stoch(close, high, low, period), 'fastk', {
      label: 'FASTK',
      color: Color.Orange,
    })
  },
})
