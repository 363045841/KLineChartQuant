// LSMA：窗口最小二乘回归曲线在当前根的值。
defineIndicator({
  name: 'LSMA',
  position: Position.Main,
  onBar() {
    const period = input.int(25, { title: '周期', min: 1 })
    plot.Line(ta.linreg(close, period, 0), 'lsma', { label: 'LSMA', color: Color.Purple })
  },
})
