// ZLEMA：先构造零滞后源 close + (close − close[lag])，再对其做 EMA；历史不足时退化为 close。
defineIndicator({
  name: 'ZLEMA',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    const lag = Math.floor((period - 1) / 2)
    const zeroLag = derive(`zlema:${period}`, (_self, offset) => {
      const source = close[offset]
      const lagged = close[offset + lag]
      return Number.isNaN(lagged) ? source : source + (source - lagged)
    })
    plot.Line(ta.ema(zeroLag, period), 'zlema', { label: 'ZLEMA', color: Color.Teal })
  },
})
