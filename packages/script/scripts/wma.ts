// 线性加权移动平均，越新的价格权重越大。
defineIndicator({
  name: 'WMA',
  position: Position.Main,
  onBar() {
    const period = input.int(9, { title: '周期', min: 1 })
    const value = ta.wma(close, period)
    plot.Line(value, 'wma', { label: 'WMA', color: Color.Blue })
  },
})
