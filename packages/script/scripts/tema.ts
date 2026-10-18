// 三重指数移动平均，组合三层 EMA 抵消滞后。
defineIndicator({
  name: 'TEMA',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.tema(close, period), 'tema', { label: 'TEMA', color: Color.Purple })
  },
})
