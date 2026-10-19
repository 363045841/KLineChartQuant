// Hull 移动平均主图指标。
defineIndicator({
  name: 'HMA',
  title: '赫尔移动平均',
  info: 'HMA 组合多层 WMA 降低滞后，兼顾平滑与响应速度。',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.hma(close, period), 'hma', { label: 'HMA', color: Color.Blue })
  },
})
