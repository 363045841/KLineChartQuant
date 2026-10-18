// 按成交量加权收盘价，窗口内没有成交量时留空。
defineIndicator({
  name: 'VWMA',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    plot.Line(ta.vwma(close, volume, period), 'vwma', { label: 'VWMA', color: Color.Blue })
  },
})
