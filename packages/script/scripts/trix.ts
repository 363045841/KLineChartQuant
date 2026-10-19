// TRIX：收盘价三重指数均线的百分比变化，并附信号均线。
defineIndicator({
  name: 'TRIX',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const period = input.int(15, { title: '周期', min: 1 })
    const signalPeriod = input.int(9, { title: '信号周期', min: 1 })
    const triple = ta.ema(ta.ema(ta.ema(close, period), period), period)
    const trix = derive('trix-roc', (_self, offset) => {
      const current = triple[offset]
      const previous = triple[offset + 1]
      if (Number.isNaN(current) || Number.isNaN(previous) || previous === 0) return Number.NaN
      return ((current - previous) / previous) * 100
    })
    const signal = ta.ema(trix, signalPeriod)
    plot.LineBR(trix[0], 'trix', { label: 'TRIX', color: Color.Orange })
    plot.LineBR(signal[0], 'signal', { label: 'SIGNAL', color: Color.Blue })
    plot.Line(0, 'guide', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
