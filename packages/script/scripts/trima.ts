// 双层简单移动平均形成三角权重，平滑收盘价趋势。
defineIndicator({
  name: 'TRIMA',
  title: '三角移动平均',
  info: 'TRIMA 用两个 SMA 窗口构造三角权重，平滑效果比单层 SMA 更柔和。',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    plot.Line(ta.trima(close, period), 'trima', { label: 'TRIMA', color: Color.Blue })
  },
})
