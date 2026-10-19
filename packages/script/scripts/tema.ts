// 三重指数移动平均，组合三层 EMA 抵消滞后。
defineIndicator({
  name: 'TEMA',
  title: '三重指数移动平均',
  info: 'TEMA 用三层 EMA 组合进一步抵消滞后，对趋势转折更敏感。',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.tema(close, period), 'tema', { label: 'TEMA', color: Color.Purple })
  },
})
