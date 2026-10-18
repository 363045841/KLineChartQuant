// 快慢两条收盘价指数移动平均。
defineIndicator({
  name: 'EXPMA',
  position: Position.Main,
  onBar() {
    const fastPeriod = input.int(12, { title: '快周期', min: 1 })
    const slowPeriod = input.int(50, { title: '慢周期', min: 1 })
    const showFast = input.bool(true, { title: '显示快线' })
    const showSlow = input.bool(true, { title: '显示慢线' })
    plot.Line(ta.ema(close, fastPeriod), 'fast', {
      label: `EMA${fastPeriod}`,
      color: Color.Orange,
      visible: showFast,
    })
    plot.Line(ta.ema(close, slowPeriod), 'slow', {
      label: `EMA${slowPeriod}`,
      color: Color.Blue,
      visible: showSlow,
    })
  },
})
