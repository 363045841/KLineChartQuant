// Tillson T3 通过六层指数平滑及可调因子过滤价格噪声。
defineIndicator({
  name: 'T3',
  title: 'Tillson T3',
  info: 'T3 用多层 EMA 与体积因子组合平滑价格，在平滑度和滞后之间提供可调折中。',
  position: Position.Main,
  onBar() {
    const period = input.int(5, { title: '周期', min: 1 })
    const volumeFactor = input.float(0.7, { title: '平滑因子', min: 0, max: 1, step: 0.05 })
    plot.Line(ta.t3(close, period, volumeFactor), 't3', { label: 'T3', color: Color.Teal })
  },
})
