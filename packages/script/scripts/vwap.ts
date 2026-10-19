// VWAP：典型价的成交量加权累计均线，超过会话间隔后重新累计。
let cumulativePriceVolume = 0
let cumulativeVolume = 0
let previousTime = Number.NaN

defineIndicator({
  name: 'VWAP',
  position: Position.Sub,
  onBar() {
    const resetGapMs = input.int(0, { title: '会话间隔(毫秒)', min: 0 })
    if (!Number.isNaN(previousTime) && resetGapMs > 0 && time - previousTime > resetGapMs) {
      cumulativePriceVolume = 0
      cumulativeVolume = 0
    }
    const typical = (high + low + close) / 3
    cumulativePriceVolume += typical * volume
    cumulativeVolume += volume
    plot.Line(cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : typical, 'vwap', {
      label: 'VWAP',
      color: Color.Orange,
    })
    previousTime = time
  },
})
