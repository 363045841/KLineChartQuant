// KAMA：用效率比把快慢 EMA 的平滑系数自适应地插值，再逐 bar 递推。
let kama = Number.NaN
let barCount = 0

defineIndicator({
  name: 'KAMA',
  position: Position.Main,
  onBar() {
    const period = input.int(10, { title: '效率周期', min: 1 })
    const fastPeriod = input.int(2, { title: '快周期', min: 1 })
    const slowPeriod = input.int(30, { title: '慢周期', min: 1 })
    barCount++
    if (barCount < period) {
      plot.Line(null, 'kama', { label: 'KAMA', color: Color.Orange })
      return
    }
    if (barCount === period) {
      kama = close[0]
      plot.Line(kama, 'kama', { label: 'KAMA', color: Color.Orange })
      return
    }
    const absChange = derive('kama:abs-change', (_self, offset) =>
      Math.abs(close[offset] - close[offset + 1]),
    )
    const volatility = ta.sum(absChange, period)[0]
    const change = Math.abs(close[0] - close[period])
    const efficiency = volatility > 0 ? change / volatility : 0
    const fast = 2 / (fastPeriod + 1)
    const slow = 2 / (slowPeriod + 1)
    const smoothing = (efficiency * (fast - slow) + slow) ** 2
    kama = kama + smoothing * (close[0] - kama)
    plot.Line(kama, 'kama', { label: 'KAMA', color: Color.Orange })
  },
})
