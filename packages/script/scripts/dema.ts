// 双重指数移动平均，降低单层 EMA 的滞后。
defineIndicator({
  name: 'DEMA',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.dema(close, period), 'dema', { label: 'DEMA', color: Color.Blue })
  },
})
