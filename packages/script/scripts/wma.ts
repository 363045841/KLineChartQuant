// 线性加权移动平均，越新的价格权重越大。
defineIndicator({
  name: 'WMA',
  title: '加权移动平均',
  info: 'WMA 对近期价格赋予更高权重，比普通 MA 反应更快，适用于短期趋势跟踪。',
  position: Position.Main,
  onBar() {
    const period = input.int(9, { title: '周期', min: 1 })
    const value = ta.wma(close, period)
    plot.Line(value, 'wma', { label: 'WMA', color: Color.Blue })
  },
})
