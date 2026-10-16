// 唐奇安通道：窗口最高价、最低价与二者中点。
defineIndicator({
  name: 'Donchian',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    const upper = ta.highest(high, period)
    const lower = ta.lowest(low, period)
    plot.Line(upper, 'upper', { label: 'UPPER', color: Color.Purple })
    plot.Line((upper + lower) / 2, 'middle', { label: 'MID', color: Color.Orange })
    plot.Line(lower, 'lower', { label: 'LOWER', color: Color.Purple })
  },
})
