// 按成交量加权收盘价，窗口内没有成交量时留空。
defineIndicator({
  name: 'VWMA',
  title: '成交量加权移动平均',
  info: 'VWMA 用成交量加权价格均线，放量区域对均线影响更大。',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    plot.Line(ta.vwma(close, volume, period), 'vwma', { label: 'VWMA', color: Color.Blue })
  },
})
