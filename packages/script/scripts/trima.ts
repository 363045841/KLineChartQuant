// 双层简单移动平均形成三角权重，平滑收盘价趋势。
defineIndicator({
  name: 'TRIMA',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    plot.Line(ta.trima(close, period), 'trima', { label: 'TRIMA', color: Color.Blue })
  },
})
