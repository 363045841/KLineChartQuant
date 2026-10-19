// FRAMA：用收盘价区间的分形维数调整 EMA 平滑系数，逐 bar 递推。
let frama = Number.NaN

defineIndicator({
  name: 'frama',
  position: Position.Main,
  onBar() {
    const period = input.int(16, { title: '周期', min: 4, max: 200, step: 2 })
    const half = period / 2
    if (period < 4 || period % 2 !== 0) {
      plot.Line(null, 'frama', { label: 'FRAMA', color: Color.Blue })
      return
    }
    const fullHigh = ta.highest(close, period)[0]
    const fullLow = ta.lowest(close, period)[0]
    const firstHigh = ta.highest(close, half).at(half)
    const firstLow = ta.lowest(close, half).at(half)
    const secondHigh = ta.highest(close, half)[0]
    const secondLow = ta.lowest(close, half)[0]
    if (
      Number.isNaN(fullHigh) ||
      Number.isNaN(fullLow) ||
      Number.isNaN(firstHigh) ||
      Number.isNaN(firstLow) ||
      Number.isNaN(secondHigh) ||
      Number.isNaN(secondLow)
    ) {
      plot.Line(null, 'frama', { label: 'FRAMA', color: Color.Blue })
      return
    }
    const n1 = (firstHigh - firstLow) / half
    const n2 = (secondHigh - secondLow) / half
    const n3 = (fullHigh - fullLow) / period
    let alpha: number
    if (n1 <= 0 || n2 <= 0 || n3 <= 0) {
      // 平盘窗口退化为普通 EMA 平滑系数。
      alpha = 2 / (period + 1)
    } else {
      const dimension = (Math.log(n1 + n2) - Math.log(n3)) / Math.LN2
      alpha = Math.exp(-4.6 * (dimension - 1))
      if (!(alpha > 0)) alpha = 0.01
      if (alpha > 1) alpha = 1
    }
    const current = close[0]
    frama = Number.isNaN(frama) ? current : alpha * current + (1 - alpha) * frama
    plot.Line(frama, 'frama', { label: 'FRAMA', color: Color.Blue })
  },
})
