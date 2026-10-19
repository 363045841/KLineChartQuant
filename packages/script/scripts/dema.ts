// 双重指数移动平均，降低单层 EMA 的滞后。
defineIndicator({
  name: 'DEMA',
  title: '双重指数移动平均',
  info: 'DEMA 用两层 EMA 组合抵消部分滞后，对趋势变化的响应快于单层 EMA。',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.dema(close, period), 'dema', { label: 'DEMA', color: Color.Blue })
  },
})
