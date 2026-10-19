// ALMA：高斯权重均线，中心由 offset 控制，使用 Pine 默认的 floor=false。
defineIndicator({
  name: 'ALMA',
  position: Position.Main,
  onBar() {
    const period = input.int(9, { title: '周期', min: 1 })
    const offset = input.float(0.85, { title: '偏移', min: 0, max: 1, step: 0.01 })
    const sigma = input.float(6, { title: '宽度', min: 0.1, step: 0.1 })
    plot.Line(ta.alma(close, period, offset, sigma), 'alma', {
      label: 'ALMA',
      color: Color.Blue,
    })
  },
})
