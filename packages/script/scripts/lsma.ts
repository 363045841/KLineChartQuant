// LSMA：窗口最小二乘回归曲线在当前根的值。
defineIndicator({
  name: 'LSMA',
  title: '线性回归移动平均',
  info: 'LSMA 用最小二乘拟合窗口内价格的回归线，减少滞后并反映趋势斜率，常用于判断趋势方向。',
  position: Position.Main,
  onBar() {
    const period = input.int(25, { title: '周期', min: 1 })
    plot.Line(ta.linreg(close, period, 0), 'lsma', { label: 'LSMA', color: Color.Purple })
  },
})
