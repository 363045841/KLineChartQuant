// Keltner 通道以 EMA 为中轨，Wilder ATR 的倍数为半宽。
defineIndicator({
  name: 'Keltner',
  position: Position.Main,
  onBar() {
    const emaPeriod = input.int(20, { title: 'EMA 周期', min: 1 })
    const atrPeriod = input.int(10, { title: 'ATR 周期', min: 1 })
    const multiplier = input.float(2, { title: 'ATR 倍数', min: 0, step: 0.1 })
    const middle = ta.ema(close, emaPeriod)[0]
    const width = ta.atr(atrPeriod)[0] * multiplier
    plot.Line(middle + width, 'upper', { label: 'UP', color: Color.Red })
    plot.Line(middle, 'middle', { label: 'MID', color: Color.Orange })
    plot.Line(middle - width, 'lower', { label: 'DN', color: Color.Blue })
  },
})
