// 顾比均线以短期和长期两组 EMA 观察趋势及其收敛发散。
defineIndicator({
  name: 'GMMA',
  position: Position.Main,
  onBar() {
    const showShort = input.bool(true, { title: '显示短期均线组' })
    const showLong = input.bool(true, { title: '显示长期均线组' })
    for (const period of [3, 5, 8, 10, 12, 15]) {
      plot.Line(ta.ema(close, period), `short${period}`, {
        label: `EMA${period}`,
        color: Color.Teal,
        visible: showShort,
      })
    }
    for (const period of [30, 35, 40, 45, 50, 60]) {
      plot.Line(ta.ema(close, period), `long${period}`, {
        label: `EMA${period}`,
        color: Color.Red,
        visible: showLong,
      })
    }
  },
})
